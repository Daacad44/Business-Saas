import { Prisma } from "@daljir/database";

type DecimalInput = Prisma.Decimal | number | string | null | undefined;

/**
 * All money/quantity math in the reports module goes through Prisma.Decimal.
 * JavaScript floating point (`number`) is never used for arithmetic on
 * money or quantity values — only for row counts, day offsets, and
 * non-financial bucketing.
 */
export function money(value: DecimalInput): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

export function moneyStr(value: DecimalInput): string {
  return money(value).toFixed(2);
}

export function qtyStr(value: DecimalInput, places = 3): string {
  return money(value).toFixed(places);
}

export function sumMoney(values: DecimalInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, value) => acc.plus(money(value)), new Prisma.Decimal(0));
}

export function addMoney(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return money(a).plus(money(b));
}

export function subtractMoney(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return money(a).minus(money(b));
}

export function multiplyMoney(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return money(a).times(money(b));
}

/** Percentage of `numerator` over `denominator`, as a string with 2 decimal places. Returns "0.00" when denominator is zero. */
export function percentStr(numerator: DecimalInput, denominator: DecimalInput): string {
  const denom = money(denominator);
  if (denom.isZero()) return "0.00";
  return money(numerator).dividedBy(denom).times(100).toFixed(2);
}

/** Average of `total` over `count`, as a money string. Returns "0.00" when count is zero. */
export function averageStr(total: DecimalInput, count: number): string {
  if (!count) return "0.00";
  return money(total).dividedBy(count).toFixed(2);
}
