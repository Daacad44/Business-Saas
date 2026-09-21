import { reportProfitByProductQuerySchema, reportProfitQuerySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { sendData } from "../../lib/response.js";
import { moneyStr, percentStr, qtyStr, subtractMoney, sumMoney } from "./lib/decimal.js";
import { resolveRange } from "./lib/date-range.js";
import { paginate, paginationMeta } from "./lib/pagination.js";
import { profitByProductCount, profitByProductRows, profitTimeSeries } from "./lib/raw.js";
import { assertTenant } from "./lib/tenant.js";
import { parseReportQuery } from "./lib/validate.js";

const DEFAULT_RANGE_DAYS = 30;

export async function getProfitReport(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportProfitQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);

  const buckets = await profitTimeSeries({ businessId: tenant.businessId, start, end, groupBy: query.groupBy });

  const totalRevenue = sumMoney(buckets.map((b) => b.revenue));
  const totalCost = sumMoney(buckets.map((b) => b.cost));
  const totalProfit = subtractMoney(totalRevenue, totalCost);

  return sendData(res, {
    range: { startDate: start.toISOString(), endDate: end.toISOString(), groupBy: query.groupBy },
    totals: {
      revenue: moneyStr(totalRevenue),
      cost: moneyStr(totalCost),
      grossProfit: moneyStr(totalProfit),
      marginPercent: percentStr(totalProfit, totalRevenue),
    },
    breakdown: buckets.map((row) => {
      const profit = subtractMoney(row.revenue, row.cost);
      return {
        period: row.bucket.toISOString(),
        revenue: moneyStr(row.revenue),
        cost: moneyStr(row.cost),
        grossProfit: moneyStr(profit),
        marginPercent: percentStr(profit, row.revenue),
      };
    }),
  });
}

export async function getProfitByProduct(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const query = parseReportQuery(reportProfitByProductQuerySchema, req.query);
  const { start, end } = resolveRange(query.startDate, query.endDate, DEFAULT_RANGE_DAYS);
  const { skip, take } = paginate(query.page, query.limit);

  const [rows, total] = await Promise.all([
    profitByProductRows({ businessId: tenant.businessId, start, end, skip, take }),
    profitByProductCount({ businessId: tenant.businessId, start, end }),
  ]);

  return sendData(
    res,
    rows.map((row) => {
      const profit = subtractMoney(row.revenue, row.cost);
      return {
        productId: row.product_id,
        productName: row.product_name,
        quantitySold: qtyStr(row.quantity),
        revenue: moneyStr(row.revenue),
        cost: moneyStr(row.cost),
        grossProfit: moneyStr(profit),
        marginPercent: percentStr(profit, row.revenue),
      };
    }),
    200,
    paginationMeta(query.page, query.limit, total),
  );
}
