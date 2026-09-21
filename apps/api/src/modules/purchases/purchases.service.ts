import { createPurchaseSchema } from "@daljir/validation";
import { Prisma, type PurchaseStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { applyStockMovement } from "../inventory/stock.service.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { recalculateSupplierBalance } from "./balance.service.js";
import { nextSequenceNumber } from "./numbering.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { serializePurchase, serializePurchaseItem } from "./serialize.js";
import { assertProductInBusiness, assertSupplierInBusiness, assertWarehouseInBusiness } from "./validators.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

async function findPurchaseOr404(businessId: string, purchaseId: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
    include: { items: true },
  });
  if (!purchase) {
    throw notFound("Purchase not found");
  }
  return purchase;
}

export async function listPurchases(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const status = typeof req.query.status === "string" ? (req.query.status as PurchaseStatus) : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;

  const where: Prisma.PurchaseWhereInput = {
    businessId: tenant.businessId,
    ...(supplierId ? { supplierId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          receivedAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.purchase.count({ where }),
  ]);

  return sendData(res, purchases.map(serializePurchase), 200, paginationMeta(pagination, total));
}

export async function getPurchase(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const purchase = await findPurchaseOr404(tenant.businessId, req.params.id as string);
  return sendData(res, {
    ...serializePurchase(purchase),
    items: purchase.items.map(serializePurchaseItem),
  });
}

/**
 * GOODS RECEIPT — the single transaction that atomically:
 *   1. Validates supplier, warehouse, (optional) purchase order, and every
 *      line's product/variant belong to the SAME business.
 *   2. Computes line totals + purchase total with Prisma.Decimal only.
 *   3. Generates a gap-free per-business `purchaseNumber`.
 *   4. Creates the Purchase row (amountPaid = 0, amountDue = totalAmount).
 *   5. For every line: applies a PURCHASE_IN StockMovement (incrementing
 *      stock) and links `PurchaseItem.movementId` to it — it is therefore
 *      impossible to persist a PurchaseItem without a matching ledger row,
 *      since `movementId` is written from the same `applyStockMovement`
 *      call inside this same transaction.
 *   6. Updates the product's (or variant's) weighted-average cost price
 *      using Decimal arithmetic, business-wide (sum of StockLevel.quantity
 *      across all warehouses) BEFORE this receipt is applied.
 *   7. If linked to a PurchaseOrder, advances its status to
 *      PARTIALLY_RECEIVED or RECEIVED based on cumulative received
 *      quantities across ALL purchases against that order.
 *   8. Writes an AuditLog row.
 * Any failure at any step rolls the whole transaction back — no orphan
 * StockMovement, no orphan Purchase, no partially-updated cost price.
 */
export async function createPurchase(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createPurchaseSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    await assertSupplierInBusiness(tx, tenant.businessId, input.supplierId);
    await assertWarehouseInBusiness(tx, tenant.businessId, input.warehouseId);

    let linkedOrder = null;
    if (input.purchaseOrderId) {
      linkedOrder = await tx.purchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, businessId: tenant.businessId },
        include: { items: true },
      });
      if (!linkedOrder) {
        throw notFound("Purchase order not found");
      }
      if (linkedOrder.supplierId !== input.supplierId) {
        throw conflict("Purchase order belongs to a different supplier");
      }
      if (linkedOrder.status !== "SENT" && linkedOrder.status !== "PARTIALLY_RECEIVED") {
        throw conflict(`Cannot receive against a purchase order in status ${linkedOrder.status}`);
      }
    }

    let subtotal = new Prisma.Decimal(0);
    const lines: Array<{
      productId: string;
      variantId: string | null;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
    }> = [];

    for (const item of input.items) {
      await assertProductInBusiness(tx, tenant.businessId, item.productId, item.variantId ?? null);
      const quantity = new Prisma.Decimal(item.quantity);
      const unitCost = new Prisma.Decimal(item.unitCost);
      const totalCost = quantity.times(unitCost);
      subtotal = subtotal.plus(totalCost);
      lines.push({ productId: item.productId, variantId: item.variantId ?? null, quantity, unitCost, totalCost });
    }

    const taxAmount = new Prisma.Decimal(0);
    const totalAmount = subtotal.plus(taxAmount);

    const purchaseNumber = await nextSequenceNumber(tx, {
      businessId: tenant.businessId,
      entity: "PUR",
      count: () => tx.purchase.count({ where: { businessId: tenant.businessId } }),
    });

    const purchase = await tx.purchase.create({
      data: {
        businessId: tenant.businessId,
        purchaseOrderId: linkedOrder?.id ?? null,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        purchaseNumber,
        status: "COMPLETED",
        subtotal,
        taxAmount,
        totalAmount,
        amountPaid: new Prisma.Decimal(0),
        amountDue: totalAmount,
        receivedById: auth.userId,
        receivedAt: new Date(),
        notes: input.notes,
      },
    });

    const createdItems = [];
    for (const line of lines) {
      const priorAgg = await tx.stockLevel.aggregate({
        where: { businessId: tenant.businessId, productId: line.productId, variantId: line.variantId },
        _sum: { quantity: true },
      });
      const priorQty = priorAgg._sum.quantity ?? new Prisma.Decimal(0);

      const movement = await applyStockMovement(tx, {
        businessId: tenant.businessId,
        warehouseId: input.warehouseId,
        productId: line.productId,
        variantId: line.variantId,
        type: "PURCHASE_IN",
        quantity: line.quantity,
        unitCost: line.unitCost,
        referenceType: "purchase",
        referenceId: purchase.id,
        createdById: auth.userId,
      });

      const purchaseItem = await tx.purchaseItem.create({
        data: {
          businessId: tenant.businessId,
          purchaseId: purchase.id,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          totalCost: line.totalCost,
          movementId: movement.id,
        },
      });
      createdItems.push(purchaseItem);

      if (line.variantId) {
        const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: line.variantId } });
        const priorCost = new Prisma.Decimal(variant.costPrice);
        const newCost = priorQty.isZero()
          ? line.unitCost
          : priorQty.times(priorCost).plus(line.quantity.times(line.unitCost)).dividedBy(priorQty.plus(line.quantity));
        await tx.productVariant.update({ where: { id: line.variantId }, data: { costPrice: newCost } });
      } else {
        const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
        const priorCost = new Prisma.Decimal(product.costPrice);
        const newCost = priorQty.isZero()
          ? line.unitCost
          : priorQty.times(priorCost).plus(line.quantity.times(line.unitCost)).dividedBy(priorQty.plus(line.quantity));
        await tx.product.update({ where: { id: line.productId }, data: { costPrice: newCost } });
      }
    }

    await recalculateSupplierBalance(tx, { businessId: tenant.businessId, supplierId: input.supplierId });

    if (linkedOrder) {
      const receivedTotals = await tx.purchaseItem.groupBy({
        by: ["productId", "variantId"],
        where: { businessId: tenant.businessId, purchase: { purchaseOrderId: linkedOrder.id } },
        _sum: { quantity: true },
      });
      const receivedByLine = new Map(
        receivedTotals.map((row) => [`${row.productId}:${row.variantId ?? ""}`, row._sum.quantity ?? new Prisma.Decimal(0)]),
      );

      const fullyReceived = linkedOrder.items.every((orderItem) => {
        const key = `${orderItem.productId}:${orderItem.variantId ?? ""}`;
        const received = receivedByLine.get(key) ?? new Prisma.Decimal(0);
        return new Prisma.Decimal(received).greaterThanOrEqualTo(orderItem.quantity);
      });

      await tx.purchaseOrder.update({
        where: { id: linkedOrder.id },
        data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });
    }

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "purchase.receive",
        entityType: "Purchase",
        entityId: purchase.id,
        metadata: { purchaseNumber, totalAmount: totalAmount.toFixed(2) },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { purchase, items: createdItems };
  });

  return sendData(
    res,
    { ...serializePurchase(result.purchase), items: result.items.map(serializePurchaseItem) },
    201,
  );
}
