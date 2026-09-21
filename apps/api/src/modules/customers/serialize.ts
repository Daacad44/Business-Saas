import { Prisma } from "@prisma/client";

export function money(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return decimal.toFixed(2);
}

export function serializeCustomer<
  T extends {
    creditLimit: Prisma.Decimal;
    currentBalance: Prisma.Decimal;
  },
>(customer: T) {
  return {
    ...customer,
    creditLimit: money(customer.creditLimit),
    currentBalance: money(customer.currentBalance),
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

export function serializeDebtPayment<T extends { amount: Prisma.Decimal }>(payment: T) {
  return {
    ...payment,
    amount: money(payment.amount),
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

export function serializeSale<
  T extends {
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  },
>(sale: T) {
  return {
    ...sale,
    subtotal: money(sale.subtotal),
    discountAmount: money(sale.discountAmount),
    taxAmount: money(sale.taxAmount),
    totalAmount: money(sale.totalAmount),
  };
}
