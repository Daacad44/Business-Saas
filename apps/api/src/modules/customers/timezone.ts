import {
  resolveBusinessTimezone as resolveBusinessTimezoneShared,
  type TimezoneDbClient,
} from "@daljir/automation";
import { prisma } from "../../lib/prisma.js";

/**
 * Canonical calendar / debt predicates live in `@daljir/automation` so the
 * API dry-run and the BullMQ worker cannot drift. This module re-exports
 * them and binds `resolveBusinessTimezone` to the API Prisma client so
 * existing API callers keep a default `db` argument.
 */
export {
  calendarDaysBetweenInTimezone,
  dayBoundsInTimezone,
  debtStatusQueryWhere,
  dueTodayDebtWhere,
  openOutstandingDebtWhere,
  overdueDebtWhere,
  startOfDayInTimezone,
} from "@daljir/automation";

type DbClient = TimezoneDbClient;

export async function resolveBusinessTimezone(
  businessId: string,
  db: DbClient = prisma,
): Promise<string> {
  return resolveBusinessTimezoneShared(businessId, db);
}
