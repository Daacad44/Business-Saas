import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  calendarDaysBetweenInTimezone,
  dayBoundsInTimezone,
  overdueDebtWhere,
  startOfDayInTimezone,
} from "../modules/customers/timezone.js";
import { createDebtFixture, registerAndOnboard } from "./customers-test-helpers.js";

const app = createApp();

const BUSINESS_TIMEZONE = "Africa/Mogadishu"; // UTC+3, no DST — the platform default.

/**
 * Defect 3 regression suite. `Business.timezone` (schema default
 * `"Africa/Mogadishu"`) is the source of truth for "today" — see
 * `modules/customers/timezone.ts`. `due-today`, the aging bucket
 * boundaries, and (to the extent it is testable from stored data) the
 * `overdue` endpoint must all agree on the same calendar-day boundary.
 */
describe("debts: day boundary uses the business timezone consistently", () => {
  it("classifies a debt due at the very start and very end of today as due-today", async () => {
    const owner = await registerAndOnboard(app, "BoundaryStartEnd", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Boundary Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart, end: tomorrowStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const veryEndOfToday = new Date(tomorrowStart.getTime() - 1);

    const { debt: startDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "10.00",
      dueDate: todayStart,
    });
    const { debt: endDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "20.00",
      dueDate: veryEndOfToday,
    });

    const dueToday = await owner.agent.get("/api/v1/debts/due-today");
    expect(dueToday.status).toBe(200);
    const ids = (dueToday.body.data as Array<{ id: string }>).map((d) => d.id);
    expect(ids).toContain(startDebt.id);
    expect(ids).toContain(endDebt.id);
  });

  it("flips a debt from due-today to NOT due-today exactly at the day boundary (one second past)", async () => {
    const owner = await registerAndOnboard(app, "BoundaryFlip", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Flip Customer" });
    const customerId = customer.body.data.id as string;

    const { end: tomorrowStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const oneSecondBeforeBoundary = new Date(tomorrowStart.getTime() - 1000);
    const exactlyAtBoundary = new Date(tomorrowStart.getTime());

    const { debt: lastSecondToday } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "30.00",
      dueDate: oneSecondBeforeBoundary,
    });
    const { debt: firstSecondTomorrow } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "40.00",
      dueDate: exactlyAtBoundary,
    });

    const dueToday = await owner.agent.get("/api/v1/debts/due-today");
    const ids = (dueToday.body.data as Array<{ id: string }>).map((d) => d.id);
    expect(ids).toContain(lastSecondToday.id);
    expect(ids).not.toContain(firstSecondTomorrow.id);
  });

  it("flips the aging bucket for a debt exactly one calendar day past its due date, in the business timezone", async () => {
    const owner = await registerAndOnboard(app, "BoundaryAging", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Aging Boundary Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    // Due at the very end of yesterday (one ms before today's start): as of "now"
    // (which is within today), this is exactly one calendar day overdue.
    const dueYesterdayEnd = new Date(todayStart.getTime() - 1);
    // Due at the very start of today: not yet overdue ("current").
    const dueTodayStart = new Date(todayStart.getTime());

    const { debt: overdueByOneDay } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "50.00",
      dueDate: dueYesterdayEnd,
    });
    const { debt: dueTodayDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "60.00",
      dueDate: dueTodayStart,
    });

    const aging = await owner.agent.get("/api/v1/debts/aging").query({ customerId });
    expect(aging.status).toBe(200);
    // A debt one calendar day overdue must land in "1-30", not "current" —
    // even though, depending on what time "now" is within today, it may be
    // less than 24 raw hours past its dueDate.
    expect(aging.body.data.buckets["1-30"].total).toBe("50.00");
    expect(aging.body.data.buckets.current.total).toBe("60.00");

    const overdueRow = await prisma.customerDebt.findUnique({ where: { id: overdueByOneDay.id } });
    expect(overdueRow?.outstandingAmount.toString()).toBe("50");
    const currentRow = await prisma.customerDebt.findUnique({ where: { id: dueTodayDebt.id } });
    expect(currentRow?.outstandingAmount.toString()).toBe("60");
  });

  it("agrees across due-today, overdue, and aging for the same fixture", async () => {
    const owner = await registerAndOnboard(app, "BoundaryAgreement", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Agreement Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart, end: tomorrowStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    // Due today, still pending — must appear in due-today, must NOT be
    // OVERDUE, and must land in the "current" aging bucket.
    const { debt: dueTodayDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "70.00",
      dueDate: new Date(todayStart.getTime() + 60 * 60 * 1000), // 1h into today
    });

    // Due yesterday, marked OVERDUE (as the external status-transition job
    // would do) — must NOT appear in due-today, must appear in overdue, and
    // must land in the "1-30" aging bucket (one calendar day overdue).
    const { debt: overdueDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "80.00",
      dueDate: new Date(yesterdayStart.getTime() + 60 * 60 * 1000), // 1h into yesterday
      status: "OVERDUE",
    });

    const dueToday = await owner.agent.get("/api/v1/debts/due-today");
    const overdue = await owner.agent.get("/api/v1/debts/overdue");
    const aging = await owner.agent.get("/api/v1/debts/aging").query({ customerId });

    const dueTodayIds = (dueToday.body.data as Array<{ id: string }>).map((d) => d.id);
    const overdueIds = (overdue.body.data as Array<{ id: string }>).map((d) => d.id);

    expect(dueTodayIds).toContain(dueTodayDebt.id);
    expect(dueTodayIds).not.toContain(overdueDebt.id);

    expect(overdueIds).toContain(overdueDebt.id);
    expect(overdueIds).not.toContain(dueTodayDebt.id);

    expect(aging.body.data.buckets.current.total).toBe("70.00");
    expect(aging.body.data.buckets["1-30"].total).toBe("80.00");

    // Sanity: tomorrowStart really is 24h after todayStart (no accidental double-application of the offset).
    expect(tomorrowStart.getTime() - todayStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("classifies overdue from the due-date boundary, not from stored status", async () => {
    const owner = await registerAndOnboard(app, "BoundaryOverdueComputed", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Computed Overdue Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const oneSecondBeforeToday = new Date(todayStart.getTime() - 1000);
    const oneSecondIntoToday = new Date(todayStart.getTime() + 1000);

    // Both remain PENDING — overdue must still flip at the calendar-day boundary.
    const { debt: pastDuePending } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "90.00",
      dueDate: oneSecondBeforeToday,
    });
    const { debt: dueTodayPending } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "95.00",
      dueDate: oneSecondIntoToday,
    });

    const overdue = await owner.agent.get("/api/v1/debts/overdue");
    const overdueOnly = await owner.agent.get("/api/v1/debts").query({ overdueOnly: "true" });
    const dueToday = await owner.agent.get("/api/v1/debts/due-today");
    const aging = await owner.agent.get("/api/v1/debts/aging").query({ customerId });
    const reportsAging = await owner.agent.get("/api/v1/reports/receivables/aging");

    const overdueIds = (overdue.body.data as Array<{ id: string }>).map((d) => d.id);
    const overdueOnlyIds = (overdueOnly.body.data as Array<{ id: string }>).map((d) => d.id);
    const dueTodayIds = (dueToday.body.data as Array<{ id: string }>).map((d) => d.id);

    expect(overdueIds).toContain(pastDuePending.id);
    expect(overdueIds).not.toContain(dueTodayPending.id);
    expect(overdueOnlyIds).toEqual(overdueIds);
    expect(dueTodayIds).toContain(dueTodayPending.id);
    expect(dueTodayIds).not.toContain(pastDuePending.id);

    expect(aging.body.data.buckets["1-30"].total).toBe("90.00");
    expect(aging.body.data.buckets.current.total).toBe("95.00");

    const reportBuckets = reportsAging.body.data.buckets as Array<{
      bucket: string;
      outstanding: string;
      debtCount: number;
    }>;
    expect(reportBuckets.find((b) => b.bucket === "1-30")?.outstanding).toBe("90.00");
    expect(reportBuckets.find((b) => b.bucket === "current")?.outstanding).toBe("95.00");
  });

  it("does not leak another tenant's debts through due-today or overdue", async () => {
    const tenantA = await registerAndOnboard(app, "BoundaryIsoA", { timezone: BUSINESS_TIMEZONE });
    const tenantB = await registerAndOnboard(app, "BoundaryIsoB", { timezone: BUSINESS_TIMEZONE });

    const customerA = await tenantA.agent.post("/api/v1/customers").send({ fullName: "Iso A Customer" });
    const customerB = await tenantB.agent.post("/api/v1/customers").send({ fullName: "Iso B Customer" });

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const yesterday = new Date(todayStart.getTime() - 1000);

    const { debt: debtAToday } = await createDebtFixture({
      businessId: tenantA.businessId,
      branchId: tenantA.branchId,
      warehouseId: tenantA.warehouseId,
      customerId: customerA.body.data.id as string,
      principal: "11.00",
      dueDate: todayStart,
    });
    const { debt: debtAOverdue } = await createDebtFixture({
      businessId: tenantA.businessId,
      branchId: tenantA.branchId,
      warehouseId: tenantA.warehouseId,
      customerId: customerA.body.data.id as string,
      principal: "12.00",
      dueDate: yesterday,
    });
    const { debt: debtBToday } = await createDebtFixture({
      businessId: tenantB.businessId,
      branchId: tenantB.branchId,
      warehouseId: tenantB.warehouseId,
      customerId: customerB.body.data.id as string,
      principal: "13.00",
      dueDate: todayStart,
    });
    const { debt: debtBOverdue } = await createDebtFixture({
      businessId: tenantB.businessId,
      branchId: tenantB.branchId,
      warehouseId: tenantB.warehouseId,
      customerId: customerB.body.data.id as string,
      principal: "14.00",
      dueDate: yesterday,
    });

    const dueTodayB = await tenantB.agent.get("/api/v1/debts/due-today");
    const overdueB = await tenantB.agent.get("/api/v1/debts/overdue");
    const dueTodayIdsB = (dueTodayB.body.data as Array<{ id: string }>).map((d) => d.id);
    const overdueIdsB = (overdueB.body.data as Array<{ id: string }>).map((d) => d.id);

    expect(dueTodayIdsB).toContain(debtBToday.id);
    expect(dueTodayIdsB).not.toContain(debtAToday.id);
    expect(overdueIdsB).toContain(debtBOverdue.id);
    expect(overdueIdsB).not.toContain(debtAOverdue.id);

    const leak = await tenantB.agent.get(`/api/v1/debts/${debtAOverdue.id}`);
    expect(leak.status).toBe(404);
  });
});

describe("business timezone day-boundary math", () => {
  it("pins Africa/Mogadishu midnight to 21:00 UTC of the previous calendar day", () => {
    const noonUtc = new Date("2026-09-21T12:00:00.000Z");
    const start = startOfDayInTimezone(noonUtc, BUSINESS_TIMEZONE);
    const { start: boundStart, end: boundEnd } = dayBoundsInTimezone(noonUtc, BUSINESS_TIMEZONE);

    expect(start.toISOString()).toBe("2026-09-20T21:00:00.000Z");
    expect(boundStart.toISOString()).toBe("2026-09-20T21:00:00.000Z");
    expect(boundEnd.toISOString()).toBe("2026-09-21T21:00:00.000Z");
  });

  it("flips calendarDaysBetween by exactly 1 at the Mogadishu midnight instant", () => {
    const lastSecondSep20 = new Date("2026-09-20T20:59:59.000Z");
    const firstInstantSep21 = new Date("2026-09-20T21:00:00.000Z");
    expect(calendarDaysBetweenInTimezone(lastSecondSep20, firstInstantSep21, BUSINESS_TIMEZONE)).toBe(1);
    expect(calendarDaysBetweenInTimezone(firstInstantSep21, firstInstantSep21, BUSINESS_TIMEZONE)).toBe(0);
  });

  it("pins overdueDebtWhere.dueDate.lt to the start of the business day, not the asOf instant", () => {
    const asOf = new Date("2026-09-21T12:00:00.000Z");
    const where = overdueDebtWhere(asOf, BUSINESS_TIMEZONE);
    expect(where.dueDate).toEqual({ lt: startOfDayInTimezone(asOf, BUSINESS_TIMEZONE) });
    expect((where.dueDate as { lt: Date }).lt.toISOString()).toBe("2026-09-20T21:00:00.000Z");
    expect(where.outstandingAmount).toEqual({ gt: expect.anything() });
    expect(where.status).toEqual({ notIn: ["PAID", "CANCELLED"] });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
