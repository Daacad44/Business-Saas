/**
 * Client-side debt calendar classification.
 *
 * The API does not serialize `isOverdue` / `dueToday`. `CustomerDebt.status`
 * is settlement only (`PENDING` | `PARTIALLY_PAID` | `PAID` | `CANCELLED`).
 * Overdue / due-today are live predicates:
 *   outstandingAmount > 0
 *   AND status not in {PAID, CANCELLED}
 *   AND dueDate compared to the start of "today" in Business.timezone
 *
 * This module copies that definition from
 * `apps/api/src/modules/customers/timezone.ts` (`overdueDebtWhere`,
 * `dueTodayDebtWhere`, `calendarDaysBetweenInTimezone`). It does not invent
 * a second window (no DUE_SOON).
 *
 * Timezone assumption: the IANA zone from `GET /businesses/current`
 * (`Business.timezone`). That is the same field `resolveBusinessTimezone`
 * uses. When the payload is missing, callers fall back to `"UTC"`, matching
 * the API helper when the business row is absent. Do not use the browser's
 * local zone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEBT_SETTLEMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type DebtSettlementStatus = (typeof DEBT_SETTLEMENT_STATUSES)[number];

/** Filter values the list endpoint accepts. DUE_SOON is 422 and is not offered. */
export const DEBT_STATUS_FILTERS = [
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
  "DUE_TODAY",
  "OVERDUE",
] as const;
export type DebtStatusFilter = (typeof DEBT_STATUS_FILTERS)[number];

export type DebtCalendarLabel = "OVERDUE" | "DUE_TODAY";

export type DebtCalendarInput = {
  dueDate: string | Date;
  outstandingAmount: string;
  status: string;
};

export function isDebtSettlementStatus(status: string): status is DebtSettlementStatus {
  return (DEBT_SETTLEMENT_STATUSES as readonly string[]).includes(status);
}

/** Offset (ms) to add to a UTC instant to obtain the wall-clock time in `timeZone`. */
function timezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
    date.getMilliseconds(),
  );
  return asUTC - date.getTime();
}

/** UTC instant of 00:00:00.000 of the calendar day `date` falls on in `timeZone`. */
export function startOfDayInTimezone(date: Date, timeZone: string): Date {
  const offset = timezoneOffsetMs(date, timeZone);
  const local = new Date(date.getTime() + offset);
  const localMidnightUTC = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(localMidnightUTC - offset);
}

/**
 * Whole calendar days between `earlier` and `later` in `timeZone`, by
 * differencing day-start boundaries (same as the API helper).
 */
export function calendarDaysBetweenInTimezone(earlier: Date, later: Date, timeZone: string): number {
  const earlierStart = startOfDayInTimezone(earlier, timeZone).getTime();
  const laterStart = startOfDayInTimezone(later, timeZone).getTime();
  return Math.round((laterStart - earlierStart) / DAY_MS);
}

function hasOutstandingBalance(amount: string): boolean {
  const trimmed = amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return false;
  return /[1-9]/.test(trimmed);
}

function isOpenOutstanding(debt: DebtCalendarInput): boolean {
  return hasOutstandingBalance(debt.outstandingAmount) && debt.status !== "PAID" && debt.status !== "CANCELLED";
}

/**
 * Returns `OVERDUE` or `DUE_TODAY` for an open debt, otherwise `null`.
 * Closed rows and future-due open rows have no calendar label.
 */
export function classifyDebtCalendar(
  debt: DebtCalendarInput,
  asOf: Date,
  timeZone: string,
): DebtCalendarLabel | null {
  if (!isOpenOutstanding(debt)) return null;
  const dueDate = debt.dueDate instanceof Date ? debt.dueDate : new Date(debt.dueDate);
  if (Number.isNaN(dueDate.getTime())) return null;
  const days = calendarDaysBetweenInTimezone(dueDate, asOf, timeZone);
  if (days > 0) return "OVERDUE";
  if (days === 0) return "DUE_TODAY";
  return null;
}
