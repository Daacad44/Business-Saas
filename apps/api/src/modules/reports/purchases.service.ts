import { reportExpensesQuerySchema, reportPurchasesQuerySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { moneyStr } from "./lib/decimal.js";
import { resolveRange } from "./lib/date-range.js";
import { paginate, paginationMeta } from "./lib/pagination.js";
import { purchasesTimeSeries } from "./lib/raw.js";
import { assertTenant } from "./lib/tenant.js";
import { parseReportQuery } from "./lib/validate.js";

const DEFAULT_RANGE_DAYS = 30;

export async function getPurchasesReport(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportPurchasesQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);
  const { skip, take } = paginate(query.page, query.limit);

  const where = {
    businessId: tenant.businessId,
    status: "COMPLETED" as const,
    receivedAt: { gte: start, lt: end },
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
  };

  const [totals, buckets, bySupplierGrouped, distinctSuppliers] = await Promise.all([
    prisma.purchase.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
    purchasesTimeSeries({
      businessId: tenant.businessId,
      start,
      end,
      groupBy: query.groupBy,
      supplierId: query.supplierId,
    }),
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where,
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: "desc" } },
      skip,
      take,
    }),
    prisma.purchase.groupBy({ by: ["supplierId"], where }),
  ]);

  const suppliers = await prisma.supplier.findMany({
    where: { businessId: tenant.businessId, id: { in: bySupplierGrouped.map((g) => g.supplierId) } },
    select: { id: true, name: true },
  });
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  return sendData(
    res,
    {
      range: { startDate: start.toISOString(), endDate: end.toISOString(), groupBy: query.groupBy },
      totals: {
        totalSpend: moneyStr(totals._sum.totalAmount),
        purchaseCount: totals._count,
      },
      breakdown: buckets.map((row) => ({
        period: row.bucket.toISOString(),
        totalSpend: moneyStr(row.total),
        purchaseCount: Number(row.purchase_count),
      })),
      bySupplier: bySupplierGrouped.map((row) => ({
        supplierId: row.supplierId,
        supplierName: supplierById.get(row.supplierId)?.name ?? null,
        totalSpend: moneyStr(row._sum.totalAmount),
        purchaseCount: row._count,
      })),
    },
    200,
    paginationMeta(query.page, query.limit, distinctSuppliers.length),
  );
}

export async function getExpensesReport(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportExpensesQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);
  const { skip, take } = paginate(query.page, query.limit);

  const where = {
    businessId: tenant.businessId,
    expenseDate: { gte: start, lt: end },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  };

  const [totals, grouped, distinctCategories] = await Promise.all([
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where,
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
      skip,
      take,
    }),
    prisma.expense.groupBy({ by: ["categoryId"], where }),
  ]);

  const categories = await prisma.expenseCategory.findMany({
    where: { businessId: tenant.businessId, id: { in: grouped.map((g) => g.categoryId) } },
    select: { id: true, name: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return sendData(
    res,
    {
      range: { startDate: start.toISOString(), endDate: end.toISOString() },
      totals: {
        totalSpend: moneyStr(totals._sum.amount),
        expenseCount: totals._count,
      },
      byCategory: grouped.map((row) => ({
        categoryId: row.categoryId,
        categoryName: categoryById.get(row.categoryId)?.name ?? null,
        totalSpend: moneyStr(row._sum.amount),
        expenseCount: row._count,
      })),
    },
    200,
    paginationMeta(query.page, query.limit, distinctCategories.length),
  );
}
