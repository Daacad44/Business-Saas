import type { AutomationTrigger, CustomerDebt, Prisma, PrismaClient } from "@prisma/client";
import {
  dueSoonDebtWhere,
  dueTodayDebtWhere,
  openOutstandingDebtWhere,
  overdueDebtWhere,
  resolveBusinessTimezone,
} from "./debt-predicates.js";

export type TriggerEvaluatorDeps = {
  prisma: PrismaClient;
};

export type TriggerInput = Pick<AutomationTrigger, "type" | "offsetDays">;

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

export type TriggerEvaluator = {
  findMatchingDebts: (businessId: string, trigger: TriggerInput, debtId?: string) => Promise<CustomerDebt[]>;
  findLowStockMatches: (businessId: string, stockLevelId?: string) => Promise<LowStockMatch[]>;
};

/**
 * Finds `CustomerDebt` rows matching a given trigger for a single business.
 * Scoped strictly to `businessId` — never crosses tenant boundaries.
 *
 * Overdue / due-today / due-soon matching uses the canonical calendar
 * predicates (`overdueDebtWhere`, `dueTodayDebtWhere`, `dueSoonDebtWhere`)
 * in the business timezone. Stored `DebtStatus.OVERDUE`, `DUE_SOON`, and
 * `DUE_TODAY` are never written and are never queried.
 */
export async function findMatchingDebts(
  prisma: PrismaClient,
  businessId: string,
  trigger: TriggerInput,
  debtId?: string,
): Promise<CustomerDebt[]> {
  const timeZone = await resolveBusinessTimezone(businessId, prisma);
  const asOf = new Date();

  const scopedWhere = {
    businessId,
    ...(debtId ? { id: debtId } : {}),
  };

  switch (trigger.type) {
    case "MANUAL": {
      if (!debtId) return [];
      return prisma.customerDebt.findMany({
        where: { ...scopedWhere, ...openOutstandingDebtWhere() },
      });
    }
    case "INVOICE_DUE_SOON": {
      const offset = trigger.offsetDays ?? 3;
      return prisma.customerDebt.findMany({
        where: { ...scopedWhere, ...dueSoonDebtWhere(asOf, timeZone, offset) },
      });
    }
    case "INVOICE_DUE_TODAY": {
      return prisma.customerDebt.findMany({
        where: { ...scopedWhere, ...dueTodayDebtWhere(asOf, timeZone) },
      });
    }
    case "INVOICE_OVERDUE": {
      return prisma.customerDebt.findMany({
        where: { ...scopedWhere, ...overdueDebtWhere(asOf, timeZone) },
      });
    }
    case "LOW_STOCK":
      // Stock-based matches have no debt/due-date shape — evaluated
      // separately by `findLowStockMatches`.
      return [];
    default:
      return [];
  }
}

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
 * `Product.lowStockThreshold` unset) never matches.
 *
 * A variant-level stock line (`variantId` set) is handled the same way:
 * the threshold is still read from the parent `Product`, because
 * `ProductVariant` has no threshold field of its own (matching the report).
 *
 * Scoped strictly to `businessId` — never crosses tenant boundaries.
 */
export async function findLowStockMatches(
  prisma: PrismaClient,
  businessId: string,
  stockLevelId?: string,
): Promise<LowStockMatch[]> {
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

/**
 * Constructs the trigger evaluator for one app. Prisma is injected
 * explicitly — the package never reads `process.env` — because
 * `apps/api` (dry-run) and `apps/worker` (BullMQ scan) each own a
 * separate Prisma client instance. Both callers MUST use this factory
 * so dry-run and the worker cannot diverge.
 */
export function createTriggerEvaluator(deps: TriggerEvaluatorDeps): TriggerEvaluator {
  return {
    findMatchingDebts: (businessId, trigger, debtId) =>
      findMatchingDebts(deps.prisma, businessId, trigger, debtId),
    findLowStockMatches: (businessId, stockLevelId) =>
      findLowStockMatches(deps.prisma, businessId, stockLevelId),
  };
}
