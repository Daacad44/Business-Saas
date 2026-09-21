const DAY_MS = 24 * 60 * 60 * 1000;

export type GroupBy = "day" | "week" | "month";

export type DateRange = {
  /** Inclusive lower bound. */
  start: Date;
  /**
   * Exclusive upper bound used internally for all `gte`/`lt` filters.
   * This is NOT the same as the caller-facing `endDate` query parameter —
   * see `resolveRange()`, which converts a caller-supplied *inclusive*
   * `endDate` into this exclusive `end` by adding 1ms. From the API
   * consumer's point of view, `startDate` and `endDate` are BOTH
   * inclusive: a row occurring at exactly `endDate` is included.
   */
  end: Date;
};

/** Converts an inclusive instant into the exclusive upper bound used by [start, end) range filters. */
export function exclusiveUpperBound(date: Date): Date {
  return new Date(date.getTime() + 1);
}

export function dayStartUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Monday-anchored week start (UTC). */
export function weekStartUTC(date: Date): Date {
  const d = dayStartUTC(date);
  const day = d.getUTCDay();
  const diffFromMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffFromMonday);
  return d;
}

export function monthStartUTC(date: Date): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Resolves a caller-supplied, BOTH-BOUNDS-INCLUSIVE `[startDate, endDate]`
 * window into the internal exclusive-end `{ start, end }` used for
 * `gte`/`lt` filters. When either bound is omitted, defaults to the last
 * `defaultDays` days ending "now" (also inclusive of "now").
 */
export function resolveRange(
  startDate: Date | undefined,
  endDate: Date | undefined,
  defaultDays: number,
): DateRange {
  const inclusiveEnd = endDate ?? new Date();
  const end = exclusiveUpperBound(inclusiveEnd);
  const start = startDate ?? new Date(inclusiveEnd.getTime() - defaultDays * DAY_MS);
  return { start, end };
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}
