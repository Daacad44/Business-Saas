import { Prisma } from "@prisma/client";

export function money(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return decimal.toFixed(2);
}

export function quantityString(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return decimal.toFixed(3);
}

export function serializeSupplier<T extends { currentBalance: Prisma.Decimal }>(supplier: T) {
  return {
    ...supplier,
    currentBalance: money(supplier.currentBalance),
  };
}

export function serializePurchaseOrder<
  T extends { subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal },
>(order: T) {
  return {
    ...order,
    subtotal: money(order.subtotal),
    taxAmount: money(order.taxAmount),
    totalAmount: money(order.totalAmount),
  };
}

export function serializePurchaseOrderItem<
  T extends { quantity: Prisma.Decimal; unitCost: Prisma.Decimal; totalCost: Prisma.Decimal },
>(item: T) {
  return {
    ...item,
    quantity: quantityString(item.quantity),
    unitCost: money(item.unitCost),
    totalCost: money(item.totalCost),
  };
}

export function serializePurchase<
  T extends {
    subtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    amountDue: Prisma.Decimal;
  },
>(purchase: T) {
  return {
    ...purchase,
    subtotal: money(purchase.subtotal),
    taxAmount: money(purchase.taxAmount),
    totalAmount: money(purchase.totalAmount),
    amountPaid: money(purchase.amountPaid),
    amountDue: money(purchase.amountDue),
  };
}

export function serializePurchaseItem<
  T extends { quantity: Prisma.Decimal; unitCost: Prisma.Decimal; totalCost: Prisma.Decimal },
>(item: T) {
  return {
    ...item,
    quantity: quantityString(item.quantity),
    unitCost: money(item.unitCost),
    totalCost: money(item.totalCost),
  };
}

export function serializeSupplierPayment<T extends { amount: Prisma.Decimal }>(payment: T) {
  return {
    ...payment,
    amount: money(payment.amount),
  };
}

export function serializePurchaseReturn<T extends { totalAmount: Prisma.Decimal }>(purchaseReturn: T) {
  return {
    ...purchaseReturn,
    totalAmount: money(purchaseReturn.totalAmount),
  };
}

export function serializePurchaseReturnItem<
  T extends { quantity: Prisma.Decimal; unitCost: Prisma.Decimal; totalAmount: Prisma.Decimal },
>(item: T) {
  return {
    ...item,
    quantity: quantityString(item.quantity),
    unitCost: money(item.unitCost),
    totalAmount: money(item.totalAmount),
  };
}
