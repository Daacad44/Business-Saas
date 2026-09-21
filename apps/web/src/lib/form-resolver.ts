import type { FieldValues, Path, Resolver, UseFormSetError } from "react-hook-form";
import { errorMessage, fieldErrorsFrom, isForbiddenError } from "@/lib/api-errors";

function stripBlanks(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripBlanks);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === "" || (typeof entry === "number" && Number.isNaN(entry))) {
        result[key] = undefined;
      } else {
        result[key] = stripBlanks(entry);
      }
    }
    return result;
  }
  return value;
}

/**
 * Treats empty strings and NaN (the native state of untouched controlled
 * inputs) as absent before Zod runs, so optional fields are not rejected
 * by `.email()` / `.min(1)` / `.finite()` constraints meant for real input.
 */
export function withBlankAsUndefined<TFieldValues extends FieldValues>(
  resolver: Resolver<TFieldValues>,
): Resolver<TFieldValues> {
  return (values, context, options) =>
    resolver(stripBlanks(values) as TFieldValues, context, options);
}

export function userFacingError(error: unknown, fallback: string, forbidden: string): string {
  if (isForbiddenError(error)) return forbidden;
  return errorMessage(error, fallback);
}

export function applyFieldErrors<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
): boolean {
  const fieldErrors = fieldErrorsFrom(error);
  let matched = false;
  for (const [field, message] of Object.entries(fieldErrors)) {
    setError(field as Path<TFieldValues>, { message });
    matched = true;
  }
  return matched;
}

/** True when a Decimal-as-string is strictly greater than zero, without `Number()`. */
export function isPositiveDecimal(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return false;
  return /[1-9]/.test(trimmed);
}

/** True when a Decimal-as-string is zero or greater, without `Number()`. */
export function isNonNegativeDecimal(value: string): boolean {
  return /^(?:\d+)(?:\.\d+)?$/.test(value.trim());
}
