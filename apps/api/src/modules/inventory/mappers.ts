import type { Prisma } from "@prisma/client";
import type { Request } from "express";

type DecimalLike = Prisma.Decimal | null | undefined;

/**
 * Platform-wide serialization convention (see `customers/serialize.ts` and
 * `reports/lib/decimal.ts`): money fields render as a fixed 2-decimal
 * string, quantity fields as a fixed 3-decimal string. Never a bare
 * `.toString()`, which produces a variable number of decimals depending on
 * the underlying `Prisma.Decimal`'s trailing zeros.
 */
export function money(value: DecimalLike): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toFixed(2);
}

export function qty(value: DecimalLike): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toFixed(3);
}

export function decimalToString(value: DecimalLike): string | null {
  return money(value);
}

export function serializeProduct<
  T extends {
    costPrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    lowStockThreshold: Prisma.Decimal | null;
  },
>(product: T) {
  return {
    ...product,
    costPrice: money(product.costPrice),
    sellingPrice: money(product.sellingPrice),
    taxRate: money(product.taxRate),
    lowStockThreshold: qty(product.lowStockThreshold),
  };
}

export function serializeVariant<
  T extends { costPrice: Prisma.Decimal; sellingPrice: Prisma.Decimal },
>(variant: T) {
  return {
    ...variant,
    costPrice: money(variant.costPrice),
    sellingPrice: money(variant.sellingPrice),
  };
}

export function serializeBatch<
  T extends { quantity: Prisma.Decimal; costPrice: Prisma.Decimal | null },
>(batch: T) {
  return {
    ...batch,
    quantity: qty(batch.quantity),
    costPrice: money(batch.costPrice),
  };
}

export function serializeStockLevel<
  T extends {
    quantity: Prisma.Decimal;
    reservedQuantity: Prisma.Decimal;
    reorderLevel: Prisma.Decimal | null;
  },
>(level: T) {
  return {
    ...level,
    quantity: qty(level.quantity),
    reservedQuantity: qty(level.reservedQuantity),
    reorderLevel: qty(level.reorderLevel),
  };
}

export function serializeMovement<
  T extends { quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null },
>(movement: T) {
  return {
    ...movement,
    quantity: qty(movement.quantity),
    unitCost: money(movement.unitCost),
  };
}

export function serializeAdjustmentItem<
  T extends { quantityDelta: Prisma.Decimal; unitCost: Prisma.Decimal | null },
>(item: T) {
  return {
    ...item,
    quantityDelta: qty(item.quantityDelta),
    unitCost: money(item.unitCost),
  };
}

export function serializeTransferItem<T extends { quantity: Prisma.Decimal }>(item: T) {
  return {
    ...item,
    quantity: qty(item.quantity),
  };
}

export function paginationParams(query: Request["query"]) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(query.pageSize ?? "20"), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
