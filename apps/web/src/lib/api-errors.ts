import { ApiError } from "./api";

export interface ZodFlatten {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
}

/**
 * Maps a 400 VALIDATION_ERROR response (Zod's `.flatten()` shape, produced
 * by the API's error handler) into a `{ fieldName: message }` map so forms
 * can surface server-side validation against the right field, in addition
 * to client-side Zod validation.
 */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_ERROR") {
    return {};
  }
  const details = error.details as ZodFlatten | undefined;
  if (!details?.fieldErrors) return {};
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(details.fieldErrors)) {
    if (messages && messages.length > 0) {
      result[field] = messages[0];
    }
  }
  return result;
}

export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}
