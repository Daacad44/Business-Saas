import { reportDashboardQuerySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { openOutstandingDebtWhere, overdueDebtWhere, resolveBusinessTimezone } from "../customers/timezone.js";
import { moneyStr, subtractMoney } from "./lib/decimal.js";
import { dayStartUTC, exclusiveUpperBound, monthStartUTC, weekStartUTC } from "./lib/date-range.js";
import { lowStockCount, revenueCostForRange } from "./lib/raw.js";
import { assertTenant } from "./lib/tenant.js";
import { parseReportQuery } from "./lib/validate.js";

async function periodSummary(businessId: string, start: Date, end: Date) {
  const [{ revenue, cost, transaction_count: transactionCount }, cashCollected] = await Promise.all([
    revenueCostForRange({ businessId, start, end }),
    prisma.payment.aggregate({
      where: { businessId, status: "COMPLETED", paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
  ]);

  return {
    revenue: moneyStr(revenue),
    transactionCount: Number(transactionCount),
    grossProfit: moneyStr(subtractMoney(revenue, cost)),
    cashCollected: moneyStr(cashCollected._sum.amount),
  };
}

export async function getDashboard(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportDashboardQuerySchema, req.query);
  const asOf = query.asOf ?? new Date();
  const end = exclusiveUpperBound(asOf);
  const timezone = await resolveBusinessTimezone(tenant.businessId);

  const [today, thisWeek, thisMonth, outstanding, lowStock, overdueDebtCount] = await Promise.all([
    periodSummary(tenant.businessId, dayStartUTC(asOf), end),
    periodSummary(tenant.businessId, weekStartUTC(asOf), end),
    periodSummary(tenant.businessId, monthStartUTC(asOf), end),
    prisma.customerDebt.aggregate({
      // Same open-debt predicate as GET /debts/aging and
      // GET /reports/receivables/aging — cancelled (or paid) rows that
      // still carry a leftover balance must not inflate this total.
      where: { businessId: tenant.businessId, ...openOutstandingDebtWhere() },
      _sum: { outstandingAmount: true },
    }),
    lowStockCount({ businessId: tenant.businessId }),
    prisma.customerDebt.count({
      where: { businessId: tenant.businessId, ...overdueDebtWhere(asOf, timezone) },
    }),
  ]);

  return sendData(res, {
    asOf: asOf.toISOString(),
    today,
    thisWeek,
    thisMonth,
    outstandingReceivables: moneyStr(outstanding._sum.outstandingAmount),
    lowStockCount: lowStock,
    overdueDebtCount,
  });
}
