/**
 * String/BigInt decimal arithmetic for POS preview totals.
 *
 * Matches Prisma.Decimal for the magnitudes we handle (prices, quantities,
 * tax rates): operations keep 18 fractional digits and money is rendered
 * with round-half-up to 2 decimal places, the same rounding `Decimal#toFixed(2)`
 * uses at the API JSON boundary.
 *
 * Never convert money through IEEE-754 `number` / `parseFloat` for display
 * or cart arithmetic.
 */

const SCALE = 18;
const ZERO_INT = BigInt(0);
const ONE_INT = BigInt(1);
const TEN = BigInt(10);
const TWO_INT = BigInt(2);

export type DecimalValue = {
  n: bigint;
};

function pow10(exp: number): bigint {
  return TEN ** BigInt(exp);
}

const SCALE_FACTOR = pow10(SCALE);

export const ZERO: DecimalValue = { n: ZERO_INT };

export function parseDecimal(input: string): DecimalValue | null {
  const trimmed = input.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return null;
  const negative = match[1] === "-";
  const integer = match[2] ?? "0";
  const fractionRaw = match[3] ?? "";
  let fraction: string;
  let roundUp = false;
  if (fractionRaw.length <= SCALE) {
    fraction = fractionRaw.padEnd(SCALE, "0");
  } else {
    fraction = fractionRaw.slice(0, SCALE);
    const nextDigit = fractionRaw.charCodeAt(SCALE) - 48;
    roundUp = nextDigit >= 5;
  }
  let abs = BigInt(integer) * SCALE_FACTOR + BigInt(fraction);
  if (roundUp) abs += ONE_INT;
  return { n: negative ? -abs : abs };
}

export function mustParseDecimal(input: string): DecimalValue {
  return parseDecimal(input) ?? ZERO;
}

export function add(a: DecimalValue, b: DecimalValue): DecimalValue {
  return { n: a.n + b.n };
}

export function subtract(a: DecimalValue, b: DecimalValue): DecimalValue {
  return { n: a.n - b.n };
}

export function multiply(a: DecimalValue, b: DecimalValue): DecimalValue {
  const prod = a.n * b.n;
  return { n: divRoundHalfUp(prod, SCALE_FACTOR) };
}

export function divide(a: DecimalValue, b: DecimalValue): DecimalValue {
  if (b.n === ZERO_INT) return ZERO;
  return { n: divRoundHalfUp(a.n * SCALE_FACTOR, b.n) };
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === ZERO_INT) return ZERO_INT;
  const absDen = denominator < ZERO_INT ? -denominator : denominator;
  const half = absDen / TWO_INT;
  const sameSign = numerator >= ZERO_INT === denominator >= ZERO_INT;
  const absNum = numerator < ZERO_INT ? -numerator : numerator;
  const absResult = (absNum + half) / absDen;
  return sameSign ? absResult : -absResult;
}

export function clamp(value: DecimalValue, minValue: DecimalValue, maxValue: DecimalValue): DecimalValue {
  if (value.n < minValue.n) return minValue;
  if (value.n > maxValue.n) return maxValue;
  return value;
}

export function isGreaterThan(a: DecimalValue, b: DecimalValue): boolean {
  return a.n > b.n;
}

export function isNegative(value: DecimalValue): boolean {
  return value.n < ZERO_INT;
}

export function toFixed(value: DecimalValue, fractionDigits: number): string {
  const digits = Math.max(0, fractionDigits);
  const divisor = pow10(SCALE - digits);
  const rounded = divRoundHalfUp(value.n, divisor);
  const negative = rounded < ZERO_INT;
  const abs = negative ? -rounded : rounded;
  const factor = pow10(digits);
  const integer = abs / factor;
  const fraction = abs % factor;
  const sign = negative ? "-" : "";
  if (digits === 0) return `${sign}${integer.toString()}`;
  return `${sign}${integer.toString()}.${fraction.toString().padStart(digits, "0")}`;
}

/**
 * JSON numbers are required by `createSaleSchema` (`z.number()`). Call this
 * only at the request boundary — never for display or cart arithmetic.
 */
export function decimalStringToJsonNumber(value: string): number {
  const parsed = mustParseDecimal(value);
  const asString = toFixed(parsed, 6).replace(/\.?0+$/, "");
  return Number(asString);
}
