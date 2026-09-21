import { Prisma } from "@prisma/client";

export function money(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return decimal.toFixed(2);
}

export function serializeExpense<T extends { amount: Prisma.Decimal }>(expense: T) {
  return {
    ...expense,
    amount: money(expense.amount),
  };
}
