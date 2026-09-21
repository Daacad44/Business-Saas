import type { AutomationTrigger, CustomerDebt, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const NON_ACTIONABLE_DEBT_STATUSES = ["PAID", "CANCELLED"] as const;

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Finds `CustomerDebt` rows matching a given trigger for a single business.
 * Scoped strictly to `businessId` — never crosses tenant boundaries.
 * Mirrors `apps/api/src/modules/automation/trigger-evaluator.ts`.
 */
export async function findMatchingDebts(
  businessId: string,
  trigger: Pick<AutomationTrigger, "type" | "offsetDays">,
  debtId?: string,
): Promise<CustomerDebt[]> {
  const today = startOfDay(new Date());

  const baseWhere = {
    businessId,
    ...(debtId ? { id: debtId } : {}),
    outstandingAmount: { gt: 0 },
    status: { notIn: [...NON_ACTIONABLE_DEBT_STATUSES] },
  };

  switch (trigger.type) {
    case "MANUAL": {
      if (!debtId) return [];
      return prisma.customerDebt.findMany({ where: baseWhere });
    }
    case "INVOICE_DUE_SOON": {
      const offset = trigger.offsetDays ?? 3;
      const targetDate = addDays(today, offset);
      const targetEnd = addDays(targetDate, 1);
      return prisma.customerDebt.findMany({
        where: { ...baseWhere, dueDate: { gte: targetDate, lt: targetEnd } },
      });
    }
    case "INVOICE_DUE_TODAY": {
      const tomorrow = addDays(today, 1);
      return prisma.customerDebt.findMany({
        where: { ...baseWhere, dueDate: { gte: today, lt: tomorrow } },
      });
    }
    case "INVOICE_OVERDUE": {
      return prisma.customerDebt.findMany({
        where: { ...baseWhere, dueDate: { lt: today } },
      });
    }
    case "LOW_STOCK":
      // Stock-based matches have no debt/due-date shape — evaluated
      // separately by `findLowStockMatches` below.
      return [];
    default:
      return [];
  }
}

export type LowStockMatch = {
  stockLevelId: string;
  businessId: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: Prisma.Decimal;
  threshold: Prisma.Decimal;
};

/**
 * Finds `StockLevel` rows at or below their effective reorder threshold
 * for a single business.
 *
 * Effective threshold = `StockLevel.reorderLevel` when set on the stock
 * line itself, otherwise falls back to `Product.lowStockThreshold`. Only
 * `Prisma.Decimal` comparisons are used — never JavaScript floating-point
 * math.
 *
 * This is deliberately the SAME semantics as the inventory low-stock
 * report (`apps/api/src/modules/inventory/stock-levels.service.ts`
 * `listLowStock`): only products with `trackStock = true` participate,
 * and a stock line with no effective threshold (`reorderLevel` unset AND
 * `Product.lowStockThreshold` unset) never matches. `reorderLevel` has no
 * write path anywhere in the inventory module today, so it is always
 * `null` in practice and every line falls back to `lowStockThreshold` —
 * i.e. this matches the report's real-world behaviour identically today,
 * while remaining forward-compatible with a future per-stock-line
 * override without the two ever disagreeing.
 *
 * A variant-level stock line (`variantId` set) is handled the same way:
 * the threshold is still read from the parent `Product`, because
 * `ProductVariant` has no threshold field of its own (matching the report).
 *
 * Scoped strictly to `businessId` — never crosses tenant boundaries.
 */
export async function findLowStockMatches(businessId: string, stockLevelId?: string): Promise<LowStockMatch[]> {
  const levels = await prisma.stockLevel.findMany({
    where: {
      businessId,
      ...(stockLevelId ? { id: stockLevelId } : {}),
      product: { trackStock: true },
    },
    include: {
      product: { select: { name: true, sku: true, lowStockThreshold: true } },
      variant: { select: { name: true } },
    },
  });

  const matches: LowStockMatch[] = [];
  for (const level of levels) {
    const threshold = level.reorderLevel ?? level.product.lowStockThreshold;
    if (threshold === null) continue;
    if (level.quantity.lte(threshold)) {
      matches.push({
        stockLevelId: level.id,
        businessId: level.businessId,
        warehouseId: level.warehouseId,
        productId: level.productId,
        variantId: level.variantId,
        productName: level.product.name,
        variantName: level.variant?.name ?? null,
        sku: level.product.sku,
        quantity: level.quantity,
        threshold,
      });
    }
  }
  return matches;
}
