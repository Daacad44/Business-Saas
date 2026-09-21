import { createPurchaseReturnSchema } from "@daljir/validation";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { applyStockMovement, assertSufficientStock } from "../inventory/stock.service.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { recalculateSupplierBalance, toDecimal } from "./balance.service.js";
import { nextSequenceNumber } from "./numbering.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { serializePurchaseReturn, serializePurchaseReturnItem } from "./serialize.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

export async function listPurchaseReturns(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const purchaseId = typeof req.query.purchaseId === "string" ? req.query.purchaseId : undefined;

  const where: Prisma.PurchaseReturnWhereInput = {
    businessId: tenant.businessId,
    ...(supplierId ? { supplierId } : {}),
    ...(purchaseId ? { purchaseId } : {}),
  };

  const [returns, total] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where,
      orderBy: { returnedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.purchaseReturn.count({ where }),
  ]);

  return sendData(res, returns.map(serializePurchaseReturn), 200, paginationMeta(pagination, total));
}

export async function getPurchaseReturn(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const purchaseReturn = await prisma.purchaseReturn.findFirst({
    where: { id: req.params.returnId, businessId: tenant.businessId },
    include: { items: true },
  });
  if (!purchaseReturn) {
    throw notFound("Purchase return not found");
  }
  return sendData(res, {
    ...serializePurchaseReturn(purchaseReturn),
    items: purchaseReturn.items.map(serializePurchaseReturnItem),
  });
}

/**
 * PURCHASE RETURN — transactionally:
 *   1. Validates the purchase belongs to this business, and every
 *      `purchaseItemId` belongs to that same purchase (rejecting any
 *      cross-purchase / cross-tenant id with 404).
 *   2. For each line, ensures `quantity` (this return + all prior
 *      non-cancelled returns against the same PurchaseItem) never exceeds
 *      the originally received quantity — over-return is rejected with 409.
 *   3. Runs `assertSufficientStock` then `applyStockMovement` (RETURN_OUT,
 *      negative quantity) to remove the stock, linking
 *      `PurchaseReturnItem.movementId` to the new ledger row. Insufficient
 *      stock (e.g. already resold) is rejected with 409 before any write.
 *   4. Reduces the purchase's `totalAmount`/`amountDue` by the returned
 *      value (floored at 0) and recalculates the supplier's
 *      `currentBalance` from the authoritative ledger.
 *   5. Writes an AuditLog row.
 */
export async function createPurchaseReturn(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createPurchaseReturnSchema.parse(req.body);
  const purchaseId = req.params.id as string;

  const result = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: purchaseId, businessId: tenant.businessId },
    });
    if (!purchase) {
      throw notFound("Purchase not found");
    }

    let totalAmount = new Prisma.Decimal(0);
    const returnNumber = await nextSequenceNumber(tx, {
      businessId: tenant.businessId,
      entity: "PRET",
      count: () => tx.purchaseReturn.count({ where: { businessId: tenant.businessId } }),
    });

    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        businessId: tenant.businessId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        returnNumber,
        status: "COMPLETED",
        totalAmount: new Prisma.Decimal(0),
        reason: input.reason,
        processedById: auth.userId,
        returnedAt: new Date(),
      },
    });

    const createdItems = [];
    for (const item of input.items) {
      const purchaseItem = await tx.purchaseItem.findFirst({
        where: { id: item.purchaseItemId, businessId: tenant.businessId, purchaseId: purchase.id },
      });
      if (!purchaseItem) {
        throw notFound("Purchase item not found");
      }

      const alreadyReturnedAgg = await tx.purchaseReturnItem.aggregate({
        where: {
          businessId: tenant.businessId,
          purchaseItemId: purchaseItem.id,
          return: { status: { not: "CANCELLED" } },
        },
        _sum: { quantity: true },
      });
      const alreadyReturned = alreadyReturnedAgg._sum.quantity ?? new Prisma.Decimal(0);
      const requestedQuantity = new Prisma.Decimal(item.quantity);
      const remaining = new Prisma.Decimal(purchaseItem.quantity).minus(alreadyReturned);

      if (requestedQuantity.greaterThan(remaining)) {
        throw conflict(
          `Return quantity ${requestedQuantity.toFixed(3)} exceeds the remaining receivable quantity ${remaining.toFixed(3)} for this purchase line`,
        );
      }

      await assertSufficientStock(tx, {
        businessId: tenant.businessId,
        warehouseId: purchase.warehouseId,
        productId: purchaseItem.productId,
        variantId: purchaseItem.variantId,
        quantity: requestedQuantity,
      });

      const movement = await applyStockMovement(tx, {
        businessId: tenant.businessId,
        warehouseId: purchase.warehouseId,
        productId: purchaseItem.productId,
        variantId: purchaseItem.variantId,
        type: "RETURN_OUT",
        quantity: requestedQuantity.negated(),
        unitCost: purchaseItem.unitCost,
        referenceType: "purchase_return",
        referenceId: purchaseReturn.id,
        createdById: auth.userId,
      });

      const lineTotal = requestedQuantity.times(purchaseItem.unitCost);
      totalAmount = totalAmount.plus(lineTotal);

      const returnItem = await tx.purchaseReturnItem.create({
        data: {
          businessId: tenant.businessId,
          returnId: purchaseReturn.id,
          purchaseItemId: purchaseItem.id,
          productId: purchaseItem.productId,
          variantId: purchaseItem.variantId,
          quantity: requestedQuantity,
          unitCost: purchaseItem.unitCost,
          totalAmount: lineTotal,
          movementId: movement.id,
        },
      });
      createdItems.push(returnItem);
    }

    const updatedPurchaseReturn = await tx.purchaseReturn.update({
      where: { id: purchaseReturn.id },
      data: { totalAmount },
    });

    const newTotalAmount = Prisma.Decimal.max(new Prisma.Decimal(purchase.totalAmount).minus(totalAmount), 0);
    const newAmountDue = Prisma.Decimal.max(new Prisma.Decimal(purchase.amountDue).minus(totalAmount), 0);
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { totalAmount: newTotalAmount, amountDue: newAmountDue },
    });

    const balance = await recalculateSupplierBalance(tx, {
      businessId: tenant.businessId,
      supplierId: purchase.supplierId,
    });

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "purchase_return.create",
        entityType: "PurchaseReturn",
        entityId: purchaseReturn.id,
        metadata: { totalAmount: toDecimal(totalAmount).toFixed(2), newSupplierBalance: balance.currentBalance },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { purchaseReturn: updatedPurchaseReturn, items: createdItems };
  });

  return sendData(
    res,
    { ...serializePurchaseReturn(result.purchaseReturn), items: result.items.map(serializePurchaseReturnItem) },
    201,
  );
}
