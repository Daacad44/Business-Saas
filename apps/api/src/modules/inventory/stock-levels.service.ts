import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { forbidden } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { paginationParams, serializeStockLevel } from "./mappers.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

export async function listStockLevels(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const { page, pageSize, skip, take } = paginationParams(req.query);

  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;

  const where: Prisma.StockLevelWhereInput = {
    businessId: tenant.businessId,
    ...(warehouseId ? { warehouseId } : {}),
    ...(productId ? { productId } : {}),
  };

  const [total, levels] = await Promise.all([
    prisma.stockLevel.count({ where }),
    prisma.stockLevel.findMany({
      where,
      orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
      skip,
      take,
    }),
  ]);

  return sendData(res, levels.map(serializeStockLevel), 200, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

/**
 * Compares each StockLevel.quantity against its Product.lowStockThreshold
 * in application code (using Prisma.Decimal, never floating-point) rather
 * than at the SQL layer, since these two values live on different tables.
 * Only products with `trackStock = true` and a non-null threshold participate.
 */
export async function listLowStock(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const { page, pageSize } = paginationParams(req.query);
  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;

  const levels = await prisma.stockLevel.findMany({
    where: {
      businessId: tenant.businessId,
      ...(warehouseId ? { warehouseId } : {}),
      product: { trackStock: true, lowStockThreshold: { not: null } },
    },
    include: {
      product: { select: { id: true, name: true, sku: true, lowStockThreshold: true } },
    },
  });

  const lowStock = levels
    .filter((level) => level.product.lowStockThreshold != null && level.quantity.lte(level.product.lowStockThreshold))
    .sort((a, b) => a.quantity.comparedTo(b.quantity))
    .map((level) => ({
      ...serializeStockLevel(level),
      product: {
        id: level.product.id,
        name: level.product.name,
        sku: level.product.sku,
        lowStockThreshold: level.product.lowStockThreshold?.toString() ?? null,
      },
    }));

  const total = lowStock.length;
  const start = (page - 1) * pageSize;
  const pageItems = lowStock.slice(start, start + pageSize);

  return sendData(res, pageItems, 200, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

/**
 * Total stock valuation = SUM(quantity * unit cost) using Prisma.Decimal
 * arithmetic exclusively. Variant cost price is preferred when the level
 * tracks a variant, falling back to the parent product's cost price.
 */
export async function getValuation(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;

  const levels = await prisma.stockLevel.findMany({
    where: {
      businessId: tenant.businessId,
      ...(warehouseId ? { warehouseId } : {}),
    },
    include: {
      product: { select: { costPrice: true } },
      variant: { select: { costPrice: true } },
    },
  });

  const perWarehouse = new Map<string, Prisma.Decimal>();
  let grandTotal = new Prisma.Decimal(0);

  for (const level of levels) {
    const unitCost = level.variant?.costPrice ?? level.product.costPrice;
    const lineValue = level.quantity.mul(unitCost);
    grandTotal = grandTotal.add(lineValue);
    const current = perWarehouse.get(level.warehouseId) ?? new Prisma.Decimal(0);
    perWarehouse.set(level.warehouseId, current.add(lineValue));
  }

  return sendData(res, {
    totalValue: grandTotal.toFixed(2),
    byWarehouse: Array.from(perWarehouse.entries()).map(([id, value]) => ({
      warehouseId: id,
      value: value.toFixed(2),
    })),
  });
}
