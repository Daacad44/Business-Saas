import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDaysBetweenInTimezone,
  classifyDebtCalendar,
  DEBT_STATUS_FILTERS,
  startOfDayInTimezone,
} from "./calendar";

const TZ = "Africa/Mogadishu"; // UTC+3, no DST — platform default / Business.timezone.

function debt(overrides: { dueDate: Date; outstandingAmount?: string; status?: string }) {
  return {
    dueDate: overrides.dueDate,
    outstandingAmount: overrides.outstandingAmount ?? "10.00",
    status: overrides.status ?? "PENDING",
  };
}

describe("classifyDebtCalendar matches API overdueDebtWhere / dueTodayDebtWhere", () => {
  it("does not offer DUE_SOON as a status filter", () => {
    assert.equal((DEBT_STATUS_FILTERS as readonly string[]).includes("DUE_SOON"), false);
    assert.deepEqual([...DEBT_STATUS_FILTERS], [
      "PENDING",
      "PARTIALLY_PAID",
      "PAID",
      "CANCELLED",
      "DUE_TODAY",
      "OVERDUE",
    ]);
  });

  it("labels a debt due at the start and end of the business calendar day as DUE_TODAY", () => {
    const asOf = new Date("2026-09-21T12:00:00.000Z");
    const todayStart = startOfDayInTimezone(asOf, TZ);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const endOfToday = new Date(tomorrowStart.getTime() - 1);

    assert.equal(classifyDebtCalendar(debt({ dueDate: todayStart }), asOf, TZ), "DUE_TODAY");
    assert.equal(classifyDebtCalendar(debt({ dueDate: endOfToday }), asOf, TZ), "DUE_TODAY");
  });

  it("flips from DUE_TODAY to OVERDUE exactly at the next business midnight", () => {
    const asOfToday = new Date("2026-09-21T12:00:00.000Z");
    const todayStart = startOfDayInTimezone(asOfToday, TZ);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const lastSecondToday = new Date(tomorrowStart.getTime() - 1000);

    assert.equal(classifyDebtCalendar(debt({ dueDate: lastSecondToday }), asOfToday, TZ), "DUE_TODAY");
    assert.equal(classifyDebtCalendar(debt({ dueDate: lastSecondToday }), tomorrowStart, TZ), "OVERDUE");
    assert.equal(classifyDebtCalendar(debt({ dueDate: tomorrowStart }), tomorrowStart, TZ), "DUE_TODAY");
  });

  it("treats a dueDate before the start of today as OVERDUE", () => {
    const asOf = new Date("2026-09-21T21:00:00.000Z"); // 00:00 Sep 22 in Africa/Mogadishu
    const yesterdayEnd = new Date(startOfDayInTimezone(asOf, TZ).getTime() - 1);
    assert.equal(classifyDebtCalendar(debt({ dueDate: yesterdayEnd }), asOf, TZ), "OVERDUE");
    assert.equal(calendarDaysBetweenInTimezone(yesterdayEnd, asOf, TZ) > 0, true);
  });

  it("does not label future-due open debts", () => {
    const asOf = new Date("2026-09-21T12:00:00.000Z");
    const todayStart = startOfDayInTimezone(asOf, TZ);
    const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    assert.equal(classifyDebtCalendar(debt({ dueDate: tomorrow }), asOf, TZ), null);
  });

  it("ignores PAID / CANCELLED / zero-outstanding rows even when dueDate is in the past", () => {
    const asOf = new Date("2026-09-21T12:00:00.000Z");
    const past = new Date(startOfDayInTimezone(asOf, TZ).getTime() - 1);
    assert.equal(classifyDebtCalendar(debt({ dueDate: past, status: "PAID" }), asOf, TZ), null);
    assert.equal(classifyDebtCalendar(debt({ dueDate: past, status: "CANCELLED" }), asOf, TZ), null);
    assert.equal(classifyDebtCalendar(debt({ dueDate: past, outstandingAmount: "0.00" }), asOf, TZ), null);
    assert.equal(
      classifyDebtCalendar(debt({ dueDate: past, status: "PARTIALLY_PAID", outstandingAmount: "1.50" }), asOf, TZ),
      "OVERDUE",
    );
  });

  it("does not treat a stored OVERDUE enum as overdue when dueDate is still in the future", () => {
    const asOf = new Date("2026-09-21T12:00:00.000Z");
    const todayStart = startOfDayInTimezone(asOf, TZ);
    const nextWeek = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    assert.equal(classifyDebtCalendar(debt({ dueDate: nextWeek, status: "OVERDUE" }), asOf, TZ), null);
  });
});
