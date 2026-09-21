import { createPurchaseOrderSchema } from "@daljir/validation";
import { Prisma, type PurchaseOrderStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { nextSequenceNumber } from "./numbering.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { serializePurchaseOrder, serializePurchaseOrderItem } from "./serialize.js";
import { assertProductInBusiness, assertSupplierInBusiness, assertWarehouseInBusiness } from "./validators.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

async function findOrderOr404(businessId: string, orderId: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, businessId },
    include: { items: true },
  });
  if (!order) {
    throw notFound("Purchase order not found");
  }
  return order;
}

export async function listPurchaseOrders(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const status = typeof req.query.status === "string" ? (req.query.status as PurchaseOrderStatus) : undefined;

  const where: Prisma.PurchaseOrderWhereInput = {
    businessId: tenant.businessId,
    ...(supplierId ? { supplierId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(status ? { status } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return sendData(res, orders.map(serializePurchaseOrder), 200, paginationMeta(pagination, total));
}

export async function getPurchaseOrder(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const order = await findOrderOr404(tenant.businessId, req.params.id as string);
  return sendData(res, {
    ...serializePurchaseOrder(order),
    items: order.items.map(serializePurchaseOrderItem),
  });
}

/**
 * Creates a PurchaseOrder + PurchaseOrderItem rows. This is a non-inventory
 * commitment: it NEVER calls `applyStockMovement` and never touches
 * `StockLevel`/`StockMovement`. Stock only moves when the order is later
 * received via `POST /purchases` (goods receipt).
 */
export async function createPurchaseOrder(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createPurchaseOrderSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    await assertSupplierInBusiness(tx, tenant.businessId, input.supplierId);
    await assertWarehouseInBusiness(tx, tenant.businessId, input.warehouseId);

    let subtotal = new Prisma.Decimal(0);
    const lineData: Array<{
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
      lineData.push({ productId: item.productId, variantId: item.variantId ?? null, quantity, unitCost, totalCost });
    }

    const taxAmount = new Prisma.Decimal(0);
    const totalAmount = subtotal.plus(taxAmount);

    const orderNumber = await nextSequenceNumber(tx, {
      businessId: tenant.businessId,
      entity: "PO",
      count: () => tx.purchaseOrder.count({ where: { businessId: tenant.businessId } }),
    });

    const order = await tx.purchaseOrder.create({
      data: {
        businessId: tenant.businessId,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        orderNumber,
        status: "DRAFT",
        subtotal,
        taxAmount,
        totalAmount,
        expectedAt: input.expectedAt,
        orderedById: auth.userId,
        notes: input.notes,
        items: {
          create: lineData.map((line) => ({
            businessId: tenant.businessId,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            totalCost: line.totalCost,
          })),
        },
      },
      include: { items: true },
    });

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "purchase_order.create",
        entityType: "PurchaseOrder",
        entityId: order.id,
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return order;
  });

  return sendData(
    res,
    { ...serializePurchaseOrder(result), items: result.items.map(serializePurchaseOrderItem) },
    201,
  );
}

export async function approvePurchaseOrder(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const order = await findOrderOr404(tenant.businessId, req.params.id as string);

  if (order.status !== "DRAFT") {
    throw conflict(`Cannot approve a purchase order in status ${order.status}`);
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status: "SENT" },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "purchase_order.approve",
    entityType: "PurchaseOrder",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializePurchaseOrder(updated));
}

export async function cancelPurchaseOrder(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const order = await findOrderOr404(tenant.businessId, req.params.id as string);

  if (order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED" || order.status === "CANCELLED") {
    throw conflict(`Cannot cancel a purchase order in status ${order.status}`);
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "purchase_order.cancel",
    entityType: "PurchaseOrder",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializePurchaseOrder(updated));
}
