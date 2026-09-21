import type { ZodType, ZodTypeDef } from "zod";
import { AppError } from "../../../lib/errors.js";

/**
 * Report query params (date ranges, pagination, grouping) are rejected with
 * 422 UNPROCESSABLE_ENTITY rather than the API-wide default of 400, per the
 * reports module's abuse-prevention contract (inverted / oversized ranges,
 * invalid grouping, etc. are all "semantically invalid" rather than
 * "malformed"). We deliberately avoid `schema.parse()` here so the shared
 * error handler's default 400-for-ZodError behavior is bypassed for this
 * module only.
 */
export function parseReportQuery<T>(schema: ZodType<T, ZodTypeDef, unknown>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new AppError(422, "VALIDATION_ERROR", "Invalid report query parameters", result.error.flatten());
  }
  return result.data;
}
