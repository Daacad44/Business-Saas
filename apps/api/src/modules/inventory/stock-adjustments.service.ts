import { createStockAdjustmentSchema } from "@daljir/validation";
import type { Prisma, StockAdjustmentReason } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { paginationParams, serializeAdjustmentItem } from "./mappers.js";
import { applyStockMovement } from "./stock.service.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

function serializeAdjustment<T extends { items?: unknown[] }>(adjustment: T) {
  if (!adjustment.items) {
    return adjustment;
  }
  return {
    ...adjustment,
    items: (adjustment.items as Array<Parameters<typeof serializeAdjustmentItem>[0]>).map(
      serializeAdjustmentItem,
    ),
  };
}

export async function listAdjustments(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const { page, pageSize, skip, take } = paginationParams(req.query);

  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const reason = typeof req.query.reason === "string" ? (req.query.reason as StockAdjustmentReason) : undefined;

  const where: Prisma.StockAdjustmentWhereInput = {
    businessId: tenant.businessId,
    ...(warehouseId ? { warehouseId } : {}),
    ...(reason ? { reason } : {}),
  };

  const [total, adjustments] = await Promise.all([
    prisma.stockAdjustment.count({ where }),
    prisma.stockAdjustment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { items: true },
    }),
  ]);

  return sendData(res, adjustments.map(serializeAdjustment), 200, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function getAdjustment(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const adjustment = await prisma.stockAdjustment.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: { items: true },
  });
  if (!adjustment) {
    throw notFound("Stock adjustment not found");
  }
  return sendData(res, serializeAdjustment(adjustment));
}

export async function createAdjustment(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createStockAdjustmentSchema.parse(req.body);

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, businessId: tenant.businessId },
  });
  if (!warehouse) {
    throw notFound("Warehouse not found");
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId: tenant.businessId },
  });
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const item of input.items) {
    if (!productById.has(item.productId)) {
      throw notFound(`Product ${item.productId} not found`);
    }
  }

  const variantIds = [...new Set(input.items.map((item) => item.variantId).filter((id): id is string => Boolean(id)))];
  if (variantIds.length > 0) {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds }, businessId: tenant.businessId },
    });
    const variantIdSet = new Set(variants.map((variant) => variant.id));
    for (const item of input.items) {
      if (item.variantId && !variantIdSet.has(item.variantId)) {
        throw notFound(`Variant ${item.variantId} not found`);
      }
    }
  }

  const adjustment = await prisma.$transaction(async (tx) => {
    const created = await tx.stockAdjustment.create({
      data: {
        businessId: tenant.businessId,
        warehouseId: warehouse.id,
        reason: input.reason,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        status: "APPLIED",
        createdById: auth.userId,
      },
    });

    for (const item of input.items) {
      const movement = await applyStockMovement(tx, {
        businessId: tenant.businessId,
        warehouseId: warehouse.id,
        productId: item.productId,
        variantId: item.variantId ?? null,
        type: item.quantityDelta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        quantity: String(item.quantityDelta),
        unitCost: item.unitCost != null ? String(item.unitCost) : null,
        referenceType: "StockAdjustment",
        referenceId: created.id,
        notes: input.notes ?? null,
        createdById: auth.userId,
      });

      await tx.stockAdjustmentItem.create({
        data: {
          businessId: tenant.businessId,
          adjustmentId: created.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantityDelta: item.quantityDelta,
          unitCost: item.unitCost ?? null,
          movementId: movement.id,
        },
      });
    }

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "stock-adjustment.create",
        entityType: "StockAdjustment",
        entityId: created.id,
        metadata: { reason: input.reason, itemCount: input.items.length },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return tx.stockAdjustment.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true },
    });
  });

  return sendData(res, serializeAdjustment(adjustment), 201);
}
