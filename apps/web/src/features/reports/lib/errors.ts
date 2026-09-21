import { ApiError } from "@/lib/api";
import { errorMessage, isForbiddenError } from "@/lib/api-errors";

export function isReportValidationError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 422;
}

export function reportUserFacingError(
  error: unknown,
  fallback: string,
  forbidden: string,
  validation: string,
): string {
  if (isForbiddenError(error)) return forbidden;
  if (isReportValidationError(error)) return validation;
  return errorMessage(error, fallback);
}
