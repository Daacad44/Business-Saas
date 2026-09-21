import { ApiError } from "@/lib/api";
import { isForbiddenError } from "@/lib/api-errors";
import { saleConflictReason } from "./sale-errors";

export function saleErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallback: string,
  forbidden: string,
): string {
  if (isForbiddenError(error)) return forbidden;
  if (!(error instanceof ApiError)) return fallback;

  const reason = saleConflictReason(error);
  if (reason && reason !== "GENERIC") {
    return t(`conflict.${reason}`);
  }

  return error.message || fallback;
}
