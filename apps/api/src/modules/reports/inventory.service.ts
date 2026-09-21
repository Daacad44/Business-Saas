import {
  reportExpiringBatchesQuerySchema,
  reportLowStockQuerySchema,
  reportSlowMovingQuerySchema,
  reportStockMovementSummaryQuerySchema,
  reportInventoryValuationQuerySchema,
} from "@daljir/validation";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { moneyStr, qtyStr, sumMoney } from "./lib/decimal.js";
import { resolveRange } from "./lib/date-range.js";
import { paginate, paginationMeta } from "./lib/pagination.js";
import { inventoryValuationByWarehouse, lowStockCount, lowStockRows } from "./lib/raw.js";
import { assertTenant } from "./lib/tenant.js";
import { parseReportQuery } from "./lib/validate.js";

const DEFAULT_MOVEMENT_RANGE_DAYS = 30;

export async function getInventoryValuation(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportInventoryValuationQuerySchema, req.query);

  const rows = await inventoryValuationByWarehouse({ businessId: tenant.businessId, warehouseId: query.warehouseId });
  const paged = rows.slice((query.page - 1) * query.limit, (query.page - 1) * query.limit + query.limit);

  const totalValuation = sumMoney(rows.map((r) => r.valuation));
  const totalQuantity = sumMoney(rows.map((r) => r.total_quantity));

  return sendData(
    res,
    {
      totalValuation: moneyStr(totalValuation),
      totalQuantity: qtyStr(totalQuantity),
      byWarehouse: paged.map((row) => ({
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        quantity: qtyStr(row.total_quantity),
        valuation: moneyStr(row.valuation),
      })),
    },
    200,
    paginationMeta(query.page, query.limit, rows.length),
  );
}

export async function getStockMovementSummary(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportStockMovementSummaryQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_MOVEMENT_RANGE_DAYS);

  const grouped = await prisma.stockMovement.groupBy({
    by: ["type"],
    where: {
      businessId: tenant.businessId,
      createdAt: { gte: start, lt: end },
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    },
    _sum: { quantity: true },
    _count: true,
  });

  return sendData(res, {
    range: { startDate: start.toISOString(), endDate: end.toISOString() },
    byType: grouped.map((row) => ({
      type: row.type,
      quantity: qtyStr(row._sum.quantity),
      movementCount: row._count,
    })),
  });
}

export async function getLowStock(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportLowStockQuerySchema, req.query);
  const { skip, take } = paginate(query.page, query.limit);

  const [rows, total] = await Promise.all([
    lowStockRows({ businessId: tenant.businessId, warehouseId: query.warehouseId, skip, take }),
    lowStockCount({ businessId: tenant.businessId, warehouseId: query.warehouseId }),
  ]);

  return sendData(
    res,
    rows.map((row) => ({
      stockLevelId: row.stock_level_id,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      productId: row.product_id,
      productName: row.product_name,
      variantId: row.variant_id,
      variantName: row.variant_name,
      quantity: qtyStr(row.quantity),
      threshold: qtyStr(row.threshold),
      status: Number(row.quantity) <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
    })),
    200,
    paginationMeta(query.page, query.limit, total),
  );
}

export async function getExpiringBatches(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportExpiringBatchesQuerySchema, req.query);
  const { skip, take } = paginate(query.page, query.limit);
  const now = new Date();
  const horizon = new Date(now.getTime() + query.days * 24 * 60 * 60 * 1000);

  const where = {
    businessId: tenant.businessId,
    quantity: { gt: 0 },
    expiryDate: { not: null, lte: horizon },
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };

  const [batches, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: "asc" },
      skip,
      take,
    }),
    prisma.batch.count({ where }),
  ]);

  return sendData(
    res,
    batches.map((batch) => ({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      warehouseId: batch.warehouseId,
      warehouseName: batch.warehouse.name,
      productId: batch.productId,
      productName: batch.product.name,
      variantId: batch.variantId,
      variantName: batch.variant?.name ?? null,
      quantity: qtyStr(batch.quantity),
      expiryDate: batch.expiryDate?.toISOString() ?? null,
      isExpired: batch.expiryDate ? batch.expiryDate.getTime() < now.getTime() : false,
    })),
    200,
    paginationMeta(query.page, query.limit, total),
  );
}

export async function getSlowMovingStock(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportSlowMovingQuerySchema, req.query);
  const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

  const stockLevels = await prisma.stockLevel.findMany({
    where: {
      businessId: tenant.businessId,
      quantity: { gt: 0 },
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
    },
    take: 5000,
  });

  const recentlySold = await prisma.stockMovement.groupBy({
    by: ["productId", "variantId"],
    where: {
      businessId: tenant.businessId,
      type: "SALE_OUT",
      createdAt: { gte: since },
    },
  });
  const activeKey = (productId: string, variantId: string | null) => `${productId}::${variantId ?? ""}`;
  const activeSet = new Set(recentlySold.map((row) => activeKey(row.productId, row.variantId)));

  const slowMoving = stockLevels.filter((sl) => !activeSet.has(activeKey(sl.productId, sl.variantId)));
  const total = slowMoving.length;
  const paged = slowMoving.slice((query.page - 1) * query.limit, (query.page - 1) * query.limit + query.limit);

  return sendData(
    res,
    paged.map((sl) => ({
      stockLevelId: sl.id,
      warehouseId: sl.warehouseId,
      warehouseName: sl.warehouse.name,
      productId: sl.productId,
      productName: sl.product.name,
      variantId: sl.variantId,
      variantName: sl.variant?.name ?? null,
      quantity: qtyStr(sl.quantity),
      daysWithoutSale: query.days,
    })),
    200,
    paginationMeta(query.page, query.limit, total),
  );
}
