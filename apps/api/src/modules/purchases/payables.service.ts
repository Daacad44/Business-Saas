import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { forbidden } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { toDecimal } from "./balance.service.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { money, serializeSupplierPayment } from "./serialize.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

export async function getOutstandingPayables(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);

  const where: Prisma.SupplierWhereInput = {
    businessId: tenant.businessId,
    currentBalance: { gt: 0 },
  };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { currentBalance: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.supplier.count({ where }),
  ]);

  const totalOutstandingAgg = await prisma.supplier.aggregate({
    where: { businessId: tenant.businessId },
    _sum: { currentBalance: true },
  });

  return sendData(
    res,
    suppliers.map((supplier) => ({
      supplierId: supplier.id,
      supplierName: supplier.name,
      outstanding: money(supplier.currentBalance),
    })),
    200,
    {
      ...paginationMeta(pagination, total),
      totalOutstanding: money(totalOutstandingAgg._sum.currentBalance ?? new Prisma.Decimal(0)),
    },
  );
}

/**
 * Aging is computed from `Purchase.receivedAt` (the goods-receipt date)
 * since the `Purchase` model has no independent due date — unlike customer
 * debts, purchase payables age from receipt, not from an invoice due date.
 */
export async function getPayablesAging(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const asOf = typeof req.query.asOf === "string" ? new Date(req.query.asOf) : new Date();

  const purchases = await prisma.purchase.findMany({
    where: {
      businessId: tenant.businessId,
      status: { not: "CANCELLED" },
      amountDue: { gt: 0 },
      ...(supplierId ? { supplierId } : {}),
    },
    select: { amountDue: true, receivedAt: true },
  });

  const buckets = {
    current: { count: 0, total: new Prisma.Decimal(0) },
    "1-30": { count: 0, total: new Prisma.Decimal(0) },
    "31-60": { count: 0, total: new Prisma.Decimal(0) },
    "61-90": { count: 0, total: new Prisma.Decimal(0) },
    "90+": { count: 0, total: new Prisma.Decimal(0) },
  };

  let totalOutstanding = new Prisma.Decimal(0);

  for (const purchase of purchases) {
    const outstanding = toDecimal(purchase.amountDue);
    if (outstanding.lessThanOrEqualTo(0)) {
      continue;
    }
    totalOutstanding = totalOutstanding.plus(outstanding);

    const daysSinceReceipt = Math.floor((asOf.getTime() - purchase.receivedAt.getTime()) / (24 * 60 * 60 * 1000));
    let bucketKey: keyof typeof buckets;
    if (daysSinceReceipt <= 0) {
      bucketKey = "current";
    } else if (daysSinceReceipt <= 30) {
      bucketKey = "1-30";
    } else if (daysSinceReceipt <= 60) {
      bucketKey = "31-60";
    } else if (daysSinceReceipt <= 90) {
      bucketKey = "61-90";
    } else {
      bucketKey = "90+";
    }

    buckets[bucketKey].count += 1;
    buckets[bucketKey].total = buckets[bucketKey].total.plus(outstanding);
  }

  return sendData(res, {
    asOf: asOf.toISOString(),
    buckets: {
      current: { count: buckets.current.count, total: buckets.current.total.toFixed(2) },
      "1-30": { count: buckets["1-30"].count, total: buckets["1-30"].total.toFixed(2) },
      "31-60": { count: buckets["31-60"].count, total: buckets["31-60"].total.toFixed(2) },
      "61-90": { count: buckets["61-90"].count, total: buckets["61-90"].total.toFixed(2) },
      "90+": { count: buckets["90+"].count, total: buckets["90+"].total.toFixed(2) },
    },
    totalOutstanding: totalOutstanding.toFixed(2),
  });
}

export async function getPayablesPaymentHistory(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  const purchaseId = typeof req.query.purchaseId === "string" ? req.query.purchaseId : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;

  const where: Prisma.SupplierPaymentWhereInput = {
    businessId: tenant.businessId,
    ...(supplierId ? { supplierId } : {}),
    ...(purchaseId ? { purchaseId } : {}),
    ...(dateFrom || dateTo
      ? {
          paidAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const [payments, total] = await Promise.all([
    prisma.supplierPayment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.supplierPayment.count({ where }),
  ]);

  return sendData(res, payments.map(serializeSupplierPayment), 200, paginationMeta(pagination, total));
}
