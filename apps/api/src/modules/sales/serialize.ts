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

export function serializeSaleItem<
  T extends {
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    costPriceSnapshot: Prisma.Decimal | null;
  },
>(item: T) {
  return {
    ...item,
    quantity: quantityString(item.quantity),
    unitPrice: money(item.unitPrice),
    discountAmount: money(item.discountAmount),
    taxAmount: money(item.taxAmount),
    totalAmount: money(item.totalAmount),
    costPriceSnapshot: money(item.costPriceSnapshot),
  };
}

export function serializeSale<
  T extends {
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    items?: unknown[];
  },
>(sale: T) {
  const { items, ...rest } = sale as T & { items?: Array<Parameters<typeof serializeSaleItem>[0]> };
  return {
    ...rest,
    subtotal: money(sale.subtotal),
    discountAmount: money(sale.discountAmount),
    taxAmount: money(sale.taxAmount),
    totalAmount: money(sale.totalAmount),
    ...(items ? { items: items.map(serializeSaleItem) } : {}),
  };
}

export function serializeInvoice<
  T extends {
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    amountDue: Prisma.Decimal;
  },
>(invoice: T) {
  return {
    ...invoice,
    subtotal: money(invoice.subtotal),
    discountAmount: money(invoice.discountAmount),
    taxAmount: money(invoice.taxAmount),
    totalAmount: money(invoice.totalAmount),
    amountPaid: money(invoice.amountPaid),
    amountDue: money(invoice.amountDue),
  };
}

export function serializePayment<T extends { amount: Prisma.Decimal }>(payment: T) {
  return {
    ...payment,
    amount: money(payment.amount),
  };
}

export function serializePaymentAllocation<T extends { amount: Prisma.Decimal }>(allocation: T) {
  return {
    ...allocation,
    amount: money(allocation.amount),
  };
}

export function serializeDebt<
  T extends {
    principalAmount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    outstandingAmount: Prisma.Decimal;
  },
>(debt: T) {
  return {
    ...debt,
    principalAmount: money(debt.principalAmount),
    amountPaid: money(debt.amountPaid),
    outstandingAmount: money(debt.outstandingAmount),
  };
}

export function serializeSalesReturnItem<
  T extends {
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  },
>(item: T) {
  return {
    ...item,
    quantity: quantityString(item.quantity),
    unitPrice: money(item.unitPrice),
    totalAmount: money(item.totalAmount),
  };
}

export function serializeSalesReturn<
  T extends {
    totalAmount: Prisma.Decimal;
    items?: unknown[];
  },
>(salesReturn: T) {
  const { items, ...rest } = salesReturn as T & {
    items?: Array<Parameters<typeof serializeSalesReturnItem>[0]>;
  };
  return {
    ...rest,
    totalAmount: money(salesReturn.totalAmount),
    ...(items ? { items: items.map(serializeSalesReturnItem) } : {}),
  };
}
