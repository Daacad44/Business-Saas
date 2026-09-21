import { reportPayablesQuerySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { moneyStr } from "./lib/decimal.js";
import { paginate, paginationMeta } from "./lib/pagination.js";
import { assertTenant } from "./lib/tenant.js";
import { parseReportQuery } from "./lib/validate.js";

export async function getPayablesReport(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportPayablesQuerySchema, req.query);
  const { skip, take } = paginate(query.page, query.limit);

  const where = {
    businessId: tenant.businessId,
    currentBalance: { gt: 0 },
    ...(query.supplierId ? { id: query.supplierId } : {}),
  };

  const [suppliers, total, totals] = await Promise.all([
    prisma.supplier.findMany({
      where,
      select: { id: true, name: true, phone: true, currentBalance: true },
      orderBy: { currentBalance: "desc" },
      skip,
      take,
    }),
    prisma.supplier.count({ where }),
    prisma.supplier.aggregate({
      where: { businessId: tenant.businessId, currentBalance: { gt: 0 } },
      _sum: { currentBalance: true },
    }),
  ]);

  return sendData(
    res,
    {
      totalPayable: moneyStr(totals._sum.currentBalance),
      suppliers: suppliers.map((supplier) => ({
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        outstandingBalance: moneyStr(supplier.currentBalance),
      })),
    },
    200,
    paginationMeta(query.page, query.limit, total),
  );
}
