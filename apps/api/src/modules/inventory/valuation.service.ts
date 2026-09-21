import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

/**
 * Single source of truth for stock valuation math, shared by
 * `GET /inventory/stock-levels/valuation` (this module) and
 * `GET /reports/inventory/valuation` (`reports/inventory.service.ts`,
 * which imports this function rather than re-implementing the
 * aggregation), mirroring how sales/purchases import
 * `inventory/stock.service.ts`.
 *
 * Valuation of a stock line = `StockLevel.quantity * unitCost`, where
 * `unitCost` prefers the variant's own `costPrice` and falls back to the
 * parent product's `costPrice` when the line does not track a variant.
 * Zero-quantity lines are included in the aggregation (they simply
 * contribute `0` to the total) rather than filtered out, so a valuation
 * total always reflects every `StockLevel` row that exists for the
 * business/warehouse.
 *
 * Every accumulation below is full-precision `Prisma.Decimal` — nothing
 * is rounded to 2 decimal places until the caller formats the final
 * response (`.toFixed(2)`). Rounding intermediate per-line or
 * per-warehouse values before summing them would allow the grand total to
 * disagree with the sum of the true (unrounded) per-line values; rounding
 * only at the response boundary guarantees the total and the
 * per-warehouse breakdown are always mutually consistent.
 */
export type WarehouseValuation = {
  warehouseId: string;
  warehouseName: string;
  quantity: Prisma.Decimal;
  valuation: Prisma.Decimal;
};

export type StockValuationResult = {
  totalValue: Prisma.Decimal;
  totalQuantity: Prisma.Decimal;
  byWarehouse: WarehouseValuation[];
};

export async function computeStockValuation(params: {
  businessId: string;
  warehouseId?: string;
}): Promise<StockValuationResult> {
  const { businessId, warehouseId } = params;

  const levels = await prisma.stockLevel.findMany({
    where: {
      businessId,
      ...(warehouseId ? { warehouseId } : {}),
    },
    include: {
      product: { select: { costPrice: true } },
      variant: { select: { costPrice: true } },
      warehouse: { select: { id: true, name: true } },
    },
  });

  const perWarehouse = new Map<string, WarehouseValuation>();
  let totalValue = new Prisma.Decimal(0);
  let totalQuantity = new Prisma.Decimal(0);

  for (const level of levels) {
    const unitCost = level.variant?.costPrice ?? level.product.costPrice;
    const lineValue = level.quantity.mul(unitCost);

    totalValue = totalValue.add(lineValue);
    totalQuantity = totalQuantity.add(level.quantity);

    const existing = perWarehouse.get(level.warehouseId);
    if (existing) {
      existing.quantity = existing.quantity.add(level.quantity);
      existing.valuation = existing.valuation.add(lineValue);
    } else {
      perWarehouse.set(level.warehouseId, {
        warehouseId: level.warehouseId,
        warehouseName: level.warehouse.name,
        quantity: level.quantity,
        valuation: lineValue,
      });
    }
  }

  const byWarehouse = Array.from(perWarehouse.values()).sort((a, b) =>
    a.warehouseName.localeCompare(b.warehouseName),
  );

  return { totalValue, totalQuantity, byWarehouse };
}
