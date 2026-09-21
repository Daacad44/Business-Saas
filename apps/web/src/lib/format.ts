/**
 * Locale-aware, precision-safe formatting helpers shared across the web app.
 *
 * Money values coming from the API are Prisma `Decimal` fields serialized as
 * strings (e.g. "1234567890123.45"). They must never be converted through a
 * JS `number` for arithmetic or formatting because that risks silent
 * precision loss above `Number.MAX_SAFE_INTEGER` and floating-point rounding
 * errors. Every function below that touches money manipulates the decimal
 * string directly and only ever hands finished digit groups to `Intl`.
 */

export type MoneyInput = string | number;

export interface FormatMoneyOptions {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export interface FormatQuantityOptions {
  locale?: string;
  unit?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
  locale?: string;
}

export interface FormatPercentOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** Set true when the input is already a whole percentage (e.g. 42 for 42%) instead of a 0-1 ratio. */
  alreadyScaled?: boolean;
}

const DEFAULT_LOCALE = "en-US";
const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

interface ParsedDecimal {
  negative: boolean;
  integer: string;
  fraction: string;
}

function parseDecimal(input: MoneyInput): ParsedDecimal | null {
  const raw = typeof input === "number" ? formatNumberAsPlainString(input) : input.trim();
  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) return null;
  const [, sign, integer, fraction = ""] = match;
  return { negative: sign === "-" && !/^0+$/.test(integer + fraction), integer, fraction };
}

function formatNumberAsPlainString(value: number): string {
  if (!Number.isFinite(value)) return "0";
  // toString() on a finite JS number never uses exponential notation for the
  // magnitudes money/quantity fields realistically hit, so this stays exact.
  return value.toString();
}

function incrementDigitString(digits: string): string {
  const chars = digits.split("");
  let i = chars.length - 1;
  let carry = true;
  while (i >= 0 && carry) {
    const next = chars[i].charCodeAt(0) - 48 + 1;
    if (next === 10) {
      chars[i] = "0";
    } else {
      chars[i] = String(next);
      carry = false;
    }
    i -= 1;
  }
  if (carry) chars.unshift("1");
  return chars.join("");
}

function roundFraction(fraction: string, targetLength: number): { fraction: string; carry: boolean } {
  if (fraction.length <= targetLength) {
    return { fraction: fraction.padEnd(targetLength, "0"), carry: false };
  }
  const kept = fraction.slice(0, targetLength);
  const roundingDigit = fraction.charCodeAt(targetLength) - 48;
  if (roundingDigit < 5) return { fraction: kept, carry: false };
  if (targetLength === 0) return { fraction: "", carry: true };
  const incremented = incrementDigitString(kept);
  if (incremented.length > targetLength) {
    return { fraction: incremented.slice(1), carry: true };
  }
  return { fraction: incremented, carry: false };
}

function groupIntegerDigits(digits: string, groupSeparator: string): string {
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  const groups: string[] = [];
  for (let end = trimmed.length; end > 0; end -= 3) {
    const start = Math.max(0, end - 3);
    groups.unshift(trimmed.slice(start, end));
  }
  return groups.join(groupSeparator);
}

function getNumberSeparators(locale: string): { group: string; decimal: string } {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.89);
    return {
      group: parts.find((part) => part.type === "group")?.value ?? ",",
      decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    };
  } catch {
    return { group: ",", decimal: "." };
  }
}

function getCurrencyLayout(
  locale: string,
  currency: string,
): { symbol: string; prefixed: boolean; spacer: string } {
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(1);
    const symbol = parts.find((part) => part.type === "currency")?.value ?? currency;
    const prefixed = parts[0]?.type === "currency";
    const spacer = parts.find((part) => part.type === "literal" && part.value.trim() === "")?.value ?? "";
    return { symbol, prefixed, spacer };
  } catch {
    return { symbol: currency, prefixed: true, spacer: "\u00A0" };
  }
}

/**
 * Formats a monetary amount without ever routing it through floating-point
 * arithmetic. Accepts a `Decimal`-as-string or a plain number.
 */
export function formatMoney(value: MoneyInput, options: FormatMoneyOptions = {}): string {
  const { currency = "USD", locale = DEFAULT_LOCALE, minimumFractionDigits = 2, maximumFractionDigits = 2 } = options;
  const parsed = parseDecimal(value);
  if (!parsed) return "—";

  const targetLength = Math.max(minimumFractionDigits, maximumFractionDigits);
  const { fraction: roundedFraction, carry } = roundFraction(parsed.fraction, targetLength);
  const integer = carry ? incrementDigitString(parsed.integer) : parsed.integer;
  const displayFraction = roundedFraction.slice(0, Math.max(minimumFractionDigits, targetLength)).padEnd(
    minimumFractionDigits,
    "0",
  );

  const { group, decimal } = getNumberSeparators(locale);
  const { symbol, prefixed, spacer } = getCurrencyLayout(locale, currency);
  const groupedInteger = groupIntegerDigits(integer, group);
  const numberPart = displayFraction.length > 0 ? `${groupedInteger}${decimal}${displayFraction}` : groupedInteger;
  const sign = parsed.negative ? "-" : "";

  return prefixed ? `${sign}${symbol}${spacer}${numberPart}` : `${sign}${numberPart}${spacer}${symbol}`;
}

/**
 * Formats a stock/unit quantity. Quantities are typically integers, but
 * fractional units (e.g. kilograms) are supported without float rounding.
 */
export function formatQuantity(value: MoneyInput, options: FormatQuantityOptions = {}): string {
  const { locale = DEFAULT_LOCALE, unit, minimumFractionDigits = 0, maximumFractionDigits = 3 } = options;
  const parsed = parseDecimal(value);
  if (!parsed) return "—";

  const targetLength = Math.max(minimumFractionDigits, maximumFractionDigits);
  const { fraction: roundedFraction, carry } = roundFraction(parsed.fraction, targetLength);
  const integer = carry ? incrementDigitString(parsed.integer) : parsed.integer;
  const trimmedFraction = roundedFraction.replace(/0+$/, "");
  const displayFraction = trimmedFraction.length < minimumFractionDigits
    ? trimmedFraction.padEnd(minimumFractionDigits, "0")
    : trimmedFraction;

  const { group, decimal } = getNumberSeparators(locale);
  const groupedInteger = groupIntegerDigits(integer, group);
  const numberPart = displayFraction.length > 0 ? `${groupedInteger}${decimal}${displayFraction}` : groupedInteger;
  const sign = parsed.negative ? "-" : "";
  const formatted = `${sign}${numberPart}`;

  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatDate(value: string | number | Date, options: FormatDateOptions = {}): string {
  const { locale = DEFAULT_LOCALE, ...intlOptions } = options;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const hasCustomOptions = Object.keys(intlOptions).length > 0;
  return new Intl.DateTimeFormat(
    locale,
    hasCustomOptions ? intlOptions : { year: "numeric", month: "short", day: "numeric" },
  ).format(date);
}

export function formatDateTime(value: string | number | Date, options: FormatDateOptions = {}): string {
  const { locale = DEFAULT_LOCALE, ...intlOptions } = options;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const hasCustomOptions = Object.keys(intlOptions).length > 0;
  return new Intl.DateTimeFormat(
    locale,
    hasCustomOptions
      ? intlOptions
      : { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  ).format(date);
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "week", ms: 1000 * 60 * 60 * 24 * 7 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
  { unit: "second", ms: 1000 },
];

export function formatRelativeTime(
  value: string | number | Date,
  options: { locale?: string; now?: string | number | Date } = {},
): string {
  const { locale = DEFAULT_LOCALE, now = Date.now() } = options;
  const date = value instanceof Date ? value : new Date(value);
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return "—";

  const diffMs = date.getTime() - reference.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms || unit === "second") {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(0, "second");
}

/**
 * Formats a ratio (0-1) or an already-scaled percentage value as a percent
 * string. Percentages are rarely precision-critical, so this may safely use
 * `Intl.NumberFormat` with a JS number.
 */
export function formatPercent(value: MoneyInput, options: FormatPercentOptions = {}): string {
  const { locale = DEFAULT_LOCALE, minimumFractionDigits = 0, maximumFractionDigits = 1, alreadyScaled = false } =
    options;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const ratio = alreadyScaled ? numeric / 100 : numeric;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(ratio);
}
