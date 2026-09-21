import {
  reportSalesBreakdownQuerySchema,
  reportSalesQuerySchema,
  reportTopProductsQuerySchema,
} from "@daljir/validation";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { averageStr, moneyStr, qtyStr, sumMoney } from "./lib/decimal.js";
import { resolveRange } from "./lib/date-range.js";
import { paginate, paginationMeta } from "./lib/pagination.js";
import { salesTimeSeries } from "./lib/raw.js";
import { assertTenant } from "./lib/tenant.js";
import { parseReportQuery } from "./lib/validate.js";

const DEFAULT_RANGE_DAYS = 30;

export async function getSalesReport(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportSalesQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);

  const where = {
    businessId: tenant.businessId,
    status: "COMPLETED" as const,
    soldAt: { gte: start, lt: end },
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
  };

  const [totals, buckets] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true, discountAmount: true, taxAmount: true },
      _count: true,
      _avg: { totalAmount: true },
    }),
    salesTimeSeries({
      businessId: tenant.businessId,
      start,
      end,
      groupBy: query.groupBy,
      branchId: query.branchId,
      customerId: query.customerId,
    }),
  ]);

  return sendData(res, {
    range: { startDate: start.toISOString(), endDate: end.toISOString(), groupBy: query.groupBy },
    totals: {
      revenue: moneyStr(totals._sum.totalAmount),
      discount: moneyStr(totals._sum.discountAmount),
      tax: moneyStr(totals._sum.taxAmount),
      transactionCount: totals._count,
      averageBasketValue: moneyStr(totals._avg.totalAmount),
    },
    breakdown: buckets.map((row) => ({
      period: row.bucket.toISOString(),
      revenue: moneyStr(row.revenue),
      discount: moneyStr(row.discount),
      tax: moneyStr(row.tax),
      transactionCount: Number(row.transaction_count),
    })),
  });
}

export async function getSalesByBranch(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportSalesBreakdownQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);
  const { skip, take } = paginate(query.page, query.limit);

  const where = {
    businessId: tenant.businessId,
    status: "COMPLETED" as const,
    soldAt: { gte: start, lt: end },
  };

  const [grouped, distinctBranches] = await Promise.all([
    prisma.sale.groupBy({
      by: ["branchId"],
      where,
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: "desc" } },
      skip,
      take,
    }),
    prisma.sale.groupBy({ by: ["branchId"], where }),
  ]);

  const branches = await prisma.branch.findMany({
    where: { businessId: tenant.businessId, id: { in: grouped.map((g) => g.branchId) } },
    select: { id: true, name: true, code: true },
  });
  const branchById = new Map(branches.map((b) => [b.id, b]));

  return sendData(
    res,
    grouped.map((row) => ({
      branchId: row.branchId,
      branchName: branchById.get(row.branchId)?.name ?? null,
      branchCode: branchById.get(row.branchId)?.code ?? null,
      revenue: moneyStr(row._sum.totalAmount),
      transactionCount: row._count,
    })),
    200,
    paginationMeta(query.page, query.limit, distinctBranches.length),
  );
}

export async function getSalesByCustomer(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportSalesBreakdownQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);
  const { skip, take } = paginate(query.page, query.limit);

  const where = {
    businessId: tenant.businessId,
    status: "COMPLETED" as const,
    soldAt: { gte: start, lt: end },
  };

  const [grouped, distinctCustomers] = await Promise.all([
    prisma.sale.groupBy({
      by: ["customerId"],
      where,
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: "desc" } },
      skip,
      take,
    }),
    prisma.sale.groupBy({ by: ["customerId"], where }),
  ]);

  const customerIds = grouped.map((g) => g.customerId).filter((id): id is string => id !== null);
  const customers = await prisma.customer.findMany({
    where: { businessId: tenant.businessId, id: { in: customerIds } },
    select: { id: true, fullName: true, phone: true },
  });
  const customerById = new Map(customers.map((c) => [c.id, c]));

  return sendData(
    res,
    grouped.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerId ? customerById.get(row.customerId)?.fullName ?? null : "Walk-in",
      customerPhone: row.customerId ? customerById.get(row.customerId)?.phone ?? null : null,
      revenue: moneyStr(row._sum.totalAmount),
      transactionCount: row._count,
    })),
    200,
    paginationMeta(query.page, query.limit, distinctCustomers.length),
  );
}

export async function getSalesByProduct(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportSalesBreakdownQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);
  const { skip, take } = paginate(query.page, query.limit);

  const where = {
    businessId: tenant.businessId,
    sale: { businessId: tenant.businessId, status: "COMPLETED" as const, soldAt: { gte: start, lt: end } },
  };

  const [grouped, distinctProducts] = await Promise.all([
    prisma.saleItem.groupBy({
      by: ["productId"],
      where,
      _sum: { quantity: true, totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: "desc" } },
      skip,
      take,
    }),
    prisma.saleItem.groupBy({ by: ["productId"], where }),
  ]);

  const products = await prisma.product.findMany({
    where: { businessId: tenant.businessId, id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  return sendData(
    res,
    grouped.map((row) => ({
      productId: row.productId,
      productName: productById.get(row.productId)?.name ?? null,
      productSku: productById.get(row.productId)?.sku ?? null,
      quantitySold: qtyStr(row._sum.quantity),
      revenue: moneyStr(row._sum.totalAmount),
      lineItemCount: row._count,
    })),
    200,
    paginationMeta(query.page, query.limit, distinctProducts.length),
  );
}

export async function getTopProducts(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportTopProductsQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);

  const where = {
    businessId: tenant.businessId,
    sale: { businessId: tenant.businessId, status: "COMPLETED" as const, soldAt: { gte: start, lt: end } },
  };

  const grouped =
    query.sortBy === "quantity"
      ? await prisma.saleItem.groupBy({
          by: ["productId"],
          where,
          _sum: { quantity: true, totalAmount: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: query.limit,
        })
      : await prisma.saleItem.groupBy({
          by: ["productId"],
          where,
          _sum: { quantity: true, totalAmount: true },
          orderBy: { _sum: { totalAmount: "desc" } },
          take: query.limit,
        });

  const products = await prisma.product.findMany({
    where: { businessId: tenant.businessId, id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  return sendData(
    res,
    grouped.map((row) => ({
      productId: row.productId,
      productName: productById.get(row.productId)?.name ?? null,
      productSku: productById.get(row.productId)?.sku ?? null,
      quantitySold: qtyStr(row._sum.quantity),
      revenue: moneyStr(row._sum.totalAmount),
    })),
  );
}

export async function getSalesByPaymentMethod(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportSalesBreakdownQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);

  const grouped = await prisma.payment.groupBy({
    by: ["method"],
    where: { businessId: tenant.businessId, status: "COMPLETED", paidAt: { gte: start, lt: end } },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: "desc" } },
  });

  const totalAmount = sumMoney(grouped.map((row) => row._sum.amount));

  return sendData(
    res,
    grouped.map((row) => ({
      method: row.method,
      amount: moneyStr(row._sum.amount),
      transactionCount: row._count,
      averageAmount: averageStr(row._sum.amount, row._count),
    })),
    200,
    { totalAmount: moneyStr(totalAmount) },
  );
}
