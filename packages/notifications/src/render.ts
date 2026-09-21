import { Prisma } from "@prisma/client";

export type TemplateVariables = Record<string, unknown>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Formats a monetary amount with exact decimal precision.
 * Always uses `Prisma.Decimal` arithmetic — never floating-point math —
 * so amounts are never rounded incorrectly when interpolated into templates.
 */
export function formatMoney(value: Prisma.Decimal | string | number, currency?: string): string {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  const formatted = decimal.toFixed(2);
  return currency ? `${currency} ${formatted}` : formatted;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Prisma.Decimal) {
    return formatMoney(value);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

/**
 * Renders a template body by replacing `{{variableName}}` placeholders.
 *
 * - Never throws, even for malformed templates or missing variables.
 * - Unknown/missing placeholders are replaced with an empty string so a
 *   partially-configured template still produces a safe, sendable message.
 * - Money values (`Prisma.Decimal`) are rendered with exact 2-decimal
 *   precision, never through floating-point arithmetic.
 */
export function renderTemplate(body: string, variables: TemplateVariables = {}): string {
  if (typeof body !== "string") {
    return "";
  }
  return body.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    try {
      return stringifyValue(variables[key]);
    } catch {
      return "";
    }
  });
}
