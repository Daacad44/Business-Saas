import { reportAgingQuerySchema, reportCollectionsQuerySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { calendarDaysBetweenInTimezone, resolveBusinessTimezone } from "../customers/timezone.js";
import { moneyStr, sumMoney } from "./lib/decimal.js";
import { resolveRange } from "./lib/date-range.js";
import { paginationMeta } from "./lib/pagination.js";
import { assertTenant } from "./lib/tenant.js";
import { parseReportQuery } from "./lib/validate.js";

const DEFAULT_COLLECTIONS_RANGE_DAYS = 30;
const MAX_OPEN_DEBTS = 20000;

type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

const BUCKET_ORDER: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export async function getReceivablesAging(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportAgingQuerySchema, req.query);
  const asOf = query.asOf ?? new Date();
  const timezone = await resolveBusinessTimezone(tenant.businessId);

  const debts = await prisma.customerDebt.findMany({
    where: { businessId: tenant.businessId, outstandingAmount: { gt: 0 } },
    include: { customer: { select: { id: true, fullName: true, phone: true } } },
    take: MAX_OPEN_DEBTS,
  });

  const buckets: Record<AgingBucket, { outstanding: ReturnType<typeof sumMoney>; count: number }> = {
    current: { outstanding: sumMoney([]), count: 0 },
    "1-30": { outstanding: sumMoney([]), count: 0 },
    "31-60": { outstanding: sumMoney([]), count: 0 },
    "61-90": { outstanding: sumMoney([]), count: 0 },
    "90+": { outstanding: sumMoney([]), count: 0 },
  };

  const byCustomer = new Map<
    string,
    { customerId: string; customerName: string; customerPhone: string | null; outstanding: ReturnType<typeof sumMoney>; count: number; maxDaysOverdue: number }
  >();

  for (const debt of debts) {
    // Same business-timezone calendar-day rule as GET /debts/aging
    // (`calendarDaysBetweenInTimezone`). A raw 24h division of
    // `asOf - dueDate` would disagree with due-today / overdue on
    // debts that straddle midnight in the business timezone.
    const daysOverdue = calendarDaysBetweenInTimezone(debt.dueDate, asOf, timezone);
    const bucket = bucketFor(daysOverdue);
    buckets[bucket] = {
      outstanding: buckets[bucket].outstanding.plus(debt.outstandingAmount),
      count: buckets[bucket].count + 1,
    };

    if (debt.customerId) {
      const existing = byCustomer.get(debt.customerId);
      if (existing) {
        existing.outstanding = existing.outstanding.plus(debt.outstandingAmount);
        existing.count += 1;
        existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, daysOverdue);
      } else {
        byCustomer.set(debt.customerId, {
          customerId: debt.customerId,
          customerName: debt.customer.fullName,
          customerPhone: debt.customer.phone,
          outstanding: sumMoney([debt.outstandingAmount]),
          count: 1,
          maxDaysOverdue: daysOverdue,
        });
      }
    }
  }

  const byCustomerList = Array.from(byCustomer.values()).sort((a, b) =>
    b.outstanding.comparedTo(a.outstanding),
  );
  const total = byCustomerList.length;
  const skip = (query.page - 1) * query.limit;
  const paged = byCustomerList.slice(skip, skip + query.limit);

  const totalOutstanding = sumMoney(BUCKET_ORDER.map((key) => buckets[key].outstanding));

  return sendData(
    res,
    {
      asOf: asOf.toISOString(),
      totalOutstanding: moneyStr(totalOutstanding),
      buckets: BUCKET_ORDER.map((key) => ({
        bucket: key,
        outstanding: moneyStr(buckets[key].outstanding),
        debtCount: buckets[key].count,
      })),
      byCustomer: paged.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        outstanding: moneyStr(row.outstanding),
        debtCount: row.count,
        bucket: bucketFor(row.maxDaysOverdue),
      })),
    },
    200,
    paginationMeta(query.page, query.limit, total),
  );
}

export async function getCollectionsSummary(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportCollectionsQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_COLLECTIONS_RANGE_DAYS);

  const [totals, byMethod] = await Promise.all([
    prisma.debtPayment.aggregate({
      where: { businessId: tenant.businessId, paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.debtPayment.groupBy({
      by: ["method"],
      where: { businessId: tenant.businessId, paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);

  return sendData(res, {
    range: { startDate: start.toISOString(), endDate: end.toISOString() },
    totalCollected: moneyStr(totals._sum.amount),
    paymentCount: totals._count,
    byMethod: byMethod.map((row) => ({
      method: row.method,
      amount: moneyStr(row._sum.amount),
      paymentCount: row._count,
    })),
  });
}
