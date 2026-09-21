import type { Prisma } from "@prisma/client";
import type { Request } from "express";

type DecimalLike = Prisma.Decimal | null | undefined;

export function decimalToString(value: DecimalLike): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
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
    costPrice: product.costPrice.toString(),
    sellingPrice: product.sellingPrice.toString(),
    taxRate: product.taxRate.toString(),
    lowStockThreshold: decimalToString(product.lowStockThreshold),
  };
}

export function serializeVariant<
  T extends { costPrice: Prisma.Decimal; sellingPrice: Prisma.Decimal },
>(variant: T) {
  return {
    ...variant,
    costPrice: variant.costPrice.toString(),
    sellingPrice: variant.sellingPrice.toString(),
  };
}

export function serializeBatch<
  T extends { quantity: Prisma.Decimal; costPrice: Prisma.Decimal | null },
>(batch: T) {
  return {
    ...batch,
    quantity: batch.quantity.toString(),
    costPrice: decimalToString(batch.costPrice),
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
    quantity: level.quantity.toString(),
    reservedQuantity: level.reservedQuantity.toString(),
    reorderLevel: decimalToString(level.reorderLevel),
  };
}

export function serializeMovement<
  T extends { quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null },
>(movement: T) {
  return {
    ...movement,
    quantity: movement.quantity.toString(),
    unitCost: decimalToString(movement.unitCost),
  };
}

export function serializeAdjustmentItem<
  T extends { quantityDelta: Prisma.Decimal; unitCost: Prisma.Decimal | null },
>(item: T) {
  return {
    ...item,
    quantityDelta: item.quantityDelta.toString(),
    unitCost: decimalToString(item.unitCost),
  };
}

export function serializeTransferItem<T extends { quantity: Prisma.Decimal }>(item: T) {
  return {
    ...item,
    quantity: item.quantity.toString(),
  };
}

export function paginationParams(query: Request["query"]) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(query.pageSize ?? "20"), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
