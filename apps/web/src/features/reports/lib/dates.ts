import { REPORT_DEFAULT_RANGE_DAYS, REPORT_MAX_RANGE_DAYS } from "./constants";
import type { ReportGroupBy } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = REPORT_MAX_RANGE_DAYS * DAY_MS;

export type DateRangeState = {
  startDate: string;
  endDate: string;
};

export type DateRangeIssue = "inverted" | "tooLong" | null;

function utcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultDateRange(now = new Date()): DateRangeState {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - REPORT_DEFAULT_RANGE_DAYS * DAY_MS);
  return { startDate: utcDateOnly(start), endDate: utcDateOnly(end) };
}

export function toRangeQuery(range: DateRangeState): { startDate: string; endDate: string } {
  return {
    startDate: `${range.startDate}T00:00:00.000Z`,
    endDate: `${range.endDate}T23:59:59.999Z`,
  };
}

export function rangeDurationMs(range: DateRangeState): number | null {
  const start = Date.parse(`${range.startDate}T00:00:00.000Z`);
  const end = Date.parse(`${range.endDate}T23:59:59.999Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return end - start;
}

export function dateRangeIssue(range: DateRangeState): DateRangeIssue {
  const duration = rangeDurationMs(range);
  if (duration === null) return "inverted";
  if (duration < 0) return "inverted";
  if (duration > MAX_RANGE_MS) return "tooLong";
  return null;
}

export function isDateRangeValid(range: DateRangeState): boolean {
  return dateRangeIssue(range) === null;
}

export function addUtcDays(isoDate: string, days: number): string {
  const start = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return isoDate;
  return utcDateOnly(new Date(start + days * DAY_MS));
}

/** Latest end date that stays within the 366-day abuse limit when paired with `startDate`. */
export function maxEndDateFor(startDate: string): string {
  return addUtcDays(startDate, REPORT_MAX_RANGE_DAYS - 1);
}

/** Earliest start date that stays within the 366-day abuse limit when paired with `endDate`. */
export function minStartDateFor(endDate: string): string {
  return addUtcDays(endDate, -(REPORT_MAX_RANGE_DAYS - 1));
}

export function isReportGroupBy(value: string): value is ReportGroupBy {
  return value === "day" || value === "week" || value === "month";
}
