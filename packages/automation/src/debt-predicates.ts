import { Prisma, type PrismaClient } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO = new Prisma.Decimal(0);

/**
 * Prisma client or an interactive-transaction client — both expose the same
 * `business.findUnique` delegate used to resolve `Business.timezone`.
 */
export type TimezoneDbClient = {
  business: { findUnique: PrismaClient["business"]["findUnique"] };
};

/**
 * `Business.timezone` (`prisma/schema.prisma`, IANA string, defaults to
 * `"Africa/Mogadishu"`) is the single source of truth for "what day is it
 * for this business right now". Every day-boundary computation that feeds
 * customer dunning (`due-today`, overdue classification, aging buckets)
 * and automation trigger matching must resolve and use this field rather
 * than the server process's local time or a hardcoded UTC assumption.
 */
export async function resolveBusinessTimezone(
  businessId: string,
  db: TimezoneDbClient,
): Promise<string> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  return business?.timezone ?? "UTC";
}

/** Offset (ms) to add to a UTC instant to obtain the wall-clock time displayed in `timeZone` at that instant. */
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

  // `Intl.DateTimeFormat` only resolves down to whole seconds, so the
  // millisecond component of `date` (which is timezone-independent) is
  // carried through explicitly — omitting it would leave a sub-second
  // residue in the computed offset that corrupts every downstream
  // midnight boundary by up to 999ms.
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

/**
 * The UTC instant corresponding to 00:00:00.000 of the calendar day that
 * `date` falls on, as observed in `timeZone`.
 */
export function startOfDayInTimezone(date: Date, timeZone: string): Date {
  const offset = timezoneOffsetMs(date, timeZone);
  const local = new Date(date.getTime() + offset);
  const localMidnightUTC = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(localMidnightUTC - offset);
}

/** `[start, end)` bounds of the calendar day containing `date`, in `timeZone`. */
export function dayBoundsInTimezone(date: Date, timeZone: string): { start: Date; end: Date } {
  const start = startOfDayInTimezone(date, timeZone);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * Whole number of calendar days between `earlier` and `later` in
 * `timeZone`, computed by differencing calendar-day START boundaries — NOT
 * by dividing the raw millisecond difference.
 */
export function calendarDaysBetweenInTimezone(earlier: Date, later: Date, timeZone: string): number {
  const earlierStart = startOfDayInTimezone(earlier, timeZone).getTime();
  const laterStart = startOfDayInTimezone(later, timeZone).getTime();
  return Math.round((laterStart - earlierStart) / DAY_MS);
}

/**
 * An "open" debt still has an outstanding balance. Money is compared as
 * `Prisma.Decimal` (never JS float). `PAID` / `CANCELLED` are excluded
 * because those statuses ARE written by payment / settlement paths.
 *
 * `DebtStatus.OVERDUE`, `DUE_SOON`, and `DUE_TODAY` are NOT part of this
 * filter — nothing in the codebase writes them, so they must never be
 * treated as source of truth.
 */
export function openOutstandingDebtWhere(): Prisma.CustomerDebtWhereInput {
  return {
    outstandingAmount: { gt: ZERO },
    status: { notIn: ["PAID", "CANCELLED"] },
  };
}

/**
 * Canonical overdue predicate — the single source of truth for every
 * list, count, aging bucket, credit check, dashboard figure, AND
 * automation `INVOICE_OVERDUE` match.
 *
 * A debt is overdue iff it still has an outstanding balance AND its
 * `dueDate` is strictly before the start of the calendar day containing
 * `asOf` in `timeZone` (the business timezone).
 *
 * Always apply this `where` in the database. Do not filter by stored
 * `DebtStatus.OVERDUE`. The query string `status=OVERDUE` is an alias
 * for this predicate (see `debtStatusQueryWhere`), not a column match.
 */
export function overdueDebtWhere(asOf: Date, timeZone: string): Prisma.CustomerDebtWhereInput {
  return {
    ...openOutstandingDebtWhere(),
    dueDate: { lt: startOfDayInTimezone(asOf, timeZone) },
  };
}

/**
 * Open debts whose `dueDate` falls on the calendar day containing `asOf`
 * in `timeZone`. Shares the outstanding-balance half of `overdueDebtWhere`
 * so "due today" and "overdue" cannot disagree about which rows are open.
 *
 * The query string `status=DUE_TODAY` is an alias for this predicate
 * (see `debtStatusQueryWhere`), not a column match on a stored flag.
 */
export function dueTodayDebtWhere(asOf: Date, timeZone: string): Prisma.CustomerDebtWhereInput {
  const { start, end } = dayBoundsInTimezone(asOf, timeZone);
  return {
    ...openOutstandingDebtWhere(),
    dueDate: { gte: start, lt: end },
  };
}

/**
 * Open debts whose `dueDate` falls on the calendar day `offsetDays` after
 * `asOf` in `timeZone`. Used by `INVOICE_DUE_SOON` automation matching.
 *
 * This is a live calendar window, not a column match on stored
 * `DebtStatus.DUE_SOON` — that enum member is retained but never written.
 */
export function dueSoonDebtWhere(
  asOf: Date,
  timeZone: string,
  offsetDays: number,
): Prisma.CustomerDebtWhereInput {
  const start = startOfDayInTimezone(asOf, timeZone);
  const targetStart = new Date(start.getTime() + offsetDays * DAY_MS);
  const targetEnd = new Date(targetStart.getTime() + DAY_MS);
  return {
    ...openOutstandingDebtWhere(),
    dueDate: { gte: targetStart, lt: targetEnd },
  };
}

/**
 * Maps the calendar query aliases `status=OVERDUE` / `status=DUE_TODAY`
 * onto the canonical predicates. Callers MUST NOT translate these values
 * into `{ status: "OVERDUE" }` / `{ status: "DUE_TODAY" }` — those enum
 * members are retained in the schema but are never written and are not
 * a source of truth.
 *
 * `DUE_SOON` has no canonical window on the list endpoints and is not
 * handled here; those endpoints reject it with 422. Automation matching
 * uses `dueSoonDebtWhere` with an explicit `offsetDays` instead.
 */
export function debtStatusQueryWhere(
  status: "OVERDUE" | "DUE_TODAY",
  asOf: Date,
  timeZone: string,
): Prisma.CustomerDebtWhereInput {
  return status === "OVERDUE" ? overdueDebtWhere(asOf, timeZone) : dueTodayDebtWhere(asOf, timeZone);
}
