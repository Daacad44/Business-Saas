import { prisma } from "../../lib/prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `Business.timezone` (`prisma/schema.prisma`, IANA string, defaults to
 * `"Africa/Mogadishu"`) is the single source of truth for "what day is it
 * for this business right now". Every day-boundary computation that feeds
 * customer dunning (`due-today`, overdue classification, aging buckets)
 * must resolve and use this field rather than the server process's local
 * time or a hardcoded UTC assumption — otherwise a debt due today can be
 * reported as due tomorrow (or vice versa) purely because the API
 * container's clock/timezone doesn't match the business's own timezone.
 */
export async function resolveBusinessTimezone(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({
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
 * by dividing the raw millisecond difference. This guarantees a value one
 * second past a day boundary always flips the day count by exactly 1,
 * regardless of what time of day `earlier`/`later` fall at, which a raw
 * `Math.floor((later - earlier) / DAY_MS)` does not: that computation is
 * anchored to the instant `later` was captured, not to the calendar day it
 * falls on, so two calls made a few seconds apart but straddling midnight
 * can silently disagree on how many calendar days have elapsed.
 */
export function calendarDaysBetweenInTimezone(earlier: Date, later: Date, timeZone: string): number {
  const earlierStart = startOfDayInTimezone(earlier, timeZone).getTime();
  const laterStart = startOfDayInTimezone(later, timeZone).getTime();
  return Math.round((laterStart - earlierStart) / DAY_MS);
}
