import { Prisma } from "@daljir/database";
import { prisma } from "../../../lib/prisma.js";
import type { GroupBy } from "./date-range.js";

/**
 * Raw SQL in this module is used ONLY where Prisma's `groupBy`/`aggregate`
 * genuinely cannot express the query:
 *   1. Time-bucketing (`date_trunc`) — Prisma has no groupBy-by-expression.
 *   2. Cross-column multiplication (e.g. quantity * unit cost) — Prisma
 *      aggregates cannot multiply two fields together.
 *
 * Every query below is a `Prisma.sql` tagged template with bound
 * parameters (`${...}`) — no user input or businessId is ever concatenated
 * into the SQL string. `groupBy` is additionally restricted to a
 * whitelisted union type at the TypeScript level before it ever reaches
 * these functions, but is still passed as a bound parameter, never
 * interpolated as raw text.
 */

type SalesBucketRow = {
  bucket: Date;
  transaction_count: bigint;
  revenue: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
};

export async function salesTimeSeries(params: {
  businessId: string;
  start: Date;
  end: Date;
  groupBy: GroupBy;
  branchId?: string;
  customerId?: string;
}) {
  const { businessId, start, end, groupBy, branchId, customerId } = params;
  const branchFilter = branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty;
  const customerFilter = customerId ? Prisma.sql`AND s."customerId" = ${customerId}` : Prisma.empty;

  return prisma.$queryRaw<SalesBucketRow[]>`
    SELECT
      date_trunc(${groupBy}, s."soldAt") AS bucket,
      COUNT(*)::bigint AS transaction_count,
      COALESCE(SUM(s."totalAmount"), 0) AS revenue,
      COALESCE(SUM(s."discountAmount"), 0) AS discount,
      COALESCE(SUM(s."taxAmount"), 0) AS tax
    FROM "Sale" s
    WHERE s."businessId" = ${businessId}
      AND s."status" = 'COMPLETED'
      AND s."soldAt" >= ${start}
      AND s."soldAt" < ${end}
      ${branchFilter}
      ${customerFilter}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;
}

type ProfitBucketRow = {
  bucket: Date;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
};

export async function profitTimeSeries(params: {
  businessId: string;
  start: Date;
  end: Date;
  groupBy: GroupBy;
}) {
  const { businessId, start, end, groupBy } = params;
  return prisma.$queryRaw<ProfitBucketRow[]>`
    SELECT
      date_trunc(${groupBy}, s."soldAt") AS bucket,
      COALESCE(SUM(si."totalAmount"), 0) AS revenue,
      COALESCE(SUM(COALESCE(si."costPriceSnapshot", 0) * si."quantity"), 0) AS cost
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId" AND s."businessId" = si."businessId"
    WHERE si."businessId" = ${businessId}
      AND s."businessId" = ${businessId}
      AND s."status" = 'COMPLETED'
      AND s."soldAt" >= ${start}
      AND s."soldAt" < ${end}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;
}

type RevenueCostRow = {
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
  transaction_count: bigint;
};

/** Scalar (single-row) revenue + COGS + transaction count for a business over [start, end). */
export async function revenueCostForRange(params: { businessId: string; start: Date; end: Date }) {
  const { businessId, start, end } = params;
  const rows = await prisma.$queryRaw<RevenueCostRow[]>`
    SELECT
      COALESCE((
        SELECT SUM(s."totalAmount") FROM "Sale" s
        WHERE s."businessId" = ${businessId}
          AND s."status" = 'COMPLETED'
          AND s."soldAt" >= ${start}
          AND s."soldAt" < ${end}
      ), 0) AS revenue,
      COALESCE((
        SELECT SUM(COALESCE(si."costPriceSnapshot", 0) * si."quantity")
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId" AND s."businessId" = si."businessId"
        WHERE si."businessId" = ${businessId}
          AND s."businessId" = ${businessId}
          AND s."status" = 'COMPLETED'
          AND s."soldAt" >= ${start}
          AND s."soldAt" < ${end}
      ), 0) AS cost,
      COALESCE((
        SELECT COUNT(*) FROM "Sale" s
        WHERE s."businessId" = ${businessId}
          AND s."status" = 'COMPLETED'
          AND s."soldAt" >= ${start}
          AND s."soldAt" < ${end}
      ), 0)::bigint AS transaction_count
  `;
  return rows[0] ?? { revenue: new Prisma.Decimal(0), cost: new Prisma.Decimal(0), transaction_count: 0n };
}

type ProfitByProductRow = {
  product_id: string;
  product_name: string;
  quantity: Prisma.Decimal;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
};

export async function profitByProductRows(params: {
  businessId: string;
  start: Date;
  end: Date;
  skip: number;
  take: number;
}) {
  const { businessId, start, end, skip, take } = params;
  return prisma.$queryRaw<ProfitByProductRow[]>`
    SELECT
      si."productId" AS product_id,
      p."name" AS product_name,
      COALESCE(SUM(si."quantity"), 0) AS quantity,
      COALESCE(SUM(si."totalAmount"), 0) AS revenue,
      COALESCE(SUM(COALESCE(si."costPriceSnapshot", 0) * si."quantity"), 0) AS cost
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId" AND s."businessId" = si."businessId"
    JOIN "Product" p ON p.id = si."productId" AND p."businessId" = si."businessId"
    WHERE si."businessId" = ${businessId}
      AND s."businessId" = ${businessId}
      AND s."status" = 'COMPLETED'
      AND s."soldAt" >= ${start}
      AND s."soldAt" < ${end}
    GROUP BY si."productId", p."name"
    ORDER BY revenue DESC
    LIMIT ${take}
    OFFSET ${skip}
  `;
}

export async function profitByProductCount(params: { businessId: string; start: Date; end: Date }) {
  const { businessId, start, end } = params;
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT si."productId"
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId" AND s."businessId" = si."businessId"
      WHERE si."businessId" = ${businessId}
        AND s."businessId" = ${businessId}
        AND s."status" = 'COMPLETED'
        AND s."soldAt" >= ${start}
        AND s."soldAt" < ${end}
      GROUP BY si."productId"
    ) grouped
  `;
  return Number(rows[0]?.count ?? 0n);
}

type ValuationRow = {
  warehouse_id: string;
  warehouse_name: string;
  total_quantity: Prisma.Decimal;
  valuation: Prisma.Decimal;
};

export async function inventoryValuationByWarehouse(params: { businessId: string; warehouseId?: string }) {
  const { businessId, warehouseId } = params;
  const warehouseFilter = warehouseId ? Prisma.sql`AND sl."warehouseId" = ${warehouseId}` : Prisma.empty;
  return prisma.$queryRaw<ValuationRow[]>`
    SELECT
      sl."warehouseId" AS warehouse_id,
      w."name" AS warehouse_name,
      COALESCE(SUM(sl."quantity"), 0) AS total_quantity,
      COALESCE(SUM(sl."quantity" * COALESCE(pv."costPrice", p."costPrice")), 0) AS valuation
    FROM "StockLevel" sl
    JOIN "Product" p ON p.id = sl."productId" AND p."businessId" = sl."businessId"
    JOIN "Warehouse" w ON w.id = sl."warehouseId" AND w."businessId" = sl."businessId"
    LEFT JOIN "ProductVariant" pv ON pv.id = sl."variantId" AND pv."businessId" = sl."businessId"
    WHERE sl."businessId" = ${businessId}
      ${warehouseFilter}
    GROUP BY sl."warehouseId", w."name"
    ORDER BY w."name" ASC
  `;
}

type LowStockRow = {
  stock_level_id: string;
  warehouse_id: string;
  warehouse_name: string;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  quantity: Prisma.Decimal;
  threshold: Prisma.Decimal;
};

function lowStockWhere(businessId: string, warehouseId?: string) {
  const warehouseFilter = warehouseId ? Prisma.sql`AND sl."warehouseId" = ${warehouseId}` : Prisma.empty;
  return Prisma.sql`
    sl."businessId" = ${businessId}
    AND COALESCE(sl."reorderLevel", p."lowStockThreshold") IS NOT NULL
    AND sl."quantity" <= COALESCE(sl."reorderLevel", p."lowStockThreshold")
    ${warehouseFilter}
  `;
}

export async function lowStockRows(params: {
  businessId: string;
  warehouseId?: string;
  skip: number;
  take: number;
}) {
  const { businessId, warehouseId, skip, take } = params;
  return prisma.$queryRaw<LowStockRow[]>`
    SELECT
      sl."id" AS stock_level_id,
      sl."warehouseId" AS warehouse_id,
      w."name" AS warehouse_name,
      sl."productId" AS product_id,
      p."name" AS product_name,
      sl."variantId" AS variant_id,
      pv."name" AS variant_name,
      sl."quantity" AS quantity,
      COALESCE(sl."reorderLevel", p."lowStockThreshold") AS threshold
    FROM "StockLevel" sl
    JOIN "Product" p ON p.id = sl."productId" AND p."businessId" = sl."businessId"
    JOIN "Warehouse" w ON w.id = sl."warehouseId" AND w."businessId" = sl."businessId"
    LEFT JOIN "ProductVariant" pv ON pv.id = sl."variantId" AND pv."businessId" = sl."businessId"
    WHERE ${lowStockWhere(businessId, warehouseId)}
    ORDER BY (sl."quantity" - COALESCE(sl."reorderLevel", p."lowStockThreshold")) ASC
    LIMIT ${take}
    OFFSET ${skip}
  `;
}

export async function lowStockCount(params: { businessId: string; warehouseId?: string }) {
  const { businessId, warehouseId } = params;
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "StockLevel" sl
    JOIN "Product" p ON p.id = sl."productId" AND p."businessId" = sl."businessId"
    WHERE ${lowStockWhere(businessId, warehouseId)}
  `;
  return Number(rows[0]?.count ?? 0n);
}

type PurchaseBucketRow = {
  bucket: Date;
  purchase_count: bigint;
  total: Prisma.Decimal;
};

export async function purchasesTimeSeries(params: {
  businessId: string;
  start: Date;
  end: Date;
  groupBy: GroupBy;
  supplierId?: string;
}) {
  const { businessId, start, end, groupBy, supplierId } = params;
  const supplierFilter = supplierId ? Prisma.sql`AND "supplierId" = ${supplierId}` : Prisma.empty;
  return prisma.$queryRaw<PurchaseBucketRow[]>`
    SELECT
      date_trunc(${groupBy}, "receivedAt") AS bucket,
      COUNT(*)::bigint AS purchase_count,
      COALESCE(SUM("totalAmount"), 0) AS total
    FROM "Purchase"
    WHERE "businessId" = ${businessId}
      AND "status" = 'COMPLETED'
      AND "receivedAt" >= ${start}
      AND "receivedAt" < ${end}
      ${supplierFilter}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;
}
