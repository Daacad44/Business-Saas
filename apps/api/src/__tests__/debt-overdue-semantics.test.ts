import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { checkCreditEligibility } from "../modules/customers/credit.service.js";
import { dayBoundsInTimezone } from "../modules/customers/timezone.js";
import { createDebtFixture, registerAndOnboard } from "./customers-test-helpers.js";

const app = createApp();
const BUSINESS_TIMEZONE = "Africa/Mogadishu";

type DebtRow = { id: string; outstandingAmount: string; status: string };

function idsOf(body: { data: DebtRow[] }) {
  return body.data.map((d) => d.id);
}

function overdueCountFromAgingBuckets(buckets: Record<string, { count: number }>) {
  return (
    (buckets["1-30"]?.count ?? 0) +
    (buckets["31-60"]?.count ?? 0) +
    (buckets["61-90"]?.count ?? 0) +
    (buckets["90+"]?.count ?? 0)
  );
}

function overdueCountFromReportBuckets(buckets: Array<{ bucket: string; debtCount: number }>) {
  return buckets.filter((b) => b.bucket !== "current").reduce((sum, b) => sum + b.debtCount, 0);
}

describe("GET /debts?overdueOnly=true uses dueDate, not stored OVERDUE status", () => {
  it("returns exactly the overdue outstanding debts (PENDING and PARTIALLY_PAID)", async () => {
    const owner = await registerAndOnboard(app, "OverdueOnlyFilter", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Overdue Filter Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const pastDue = new Date(todayStart.getTime() - 1000);
    const futureDue = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { debt: pendingPastDue } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "40.00",
      dueDate: pastDue,
      status: "PENDING",
    });
    const { debt: partialPastDue } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "80.00",
      amountPaid: "30.00",
      outstandingAmount: "50.00",
      dueDate: pastDue,
      status: "PARTIALLY_PAID",
    });
    const { debt: futureDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "25.00",
      dueDate: futureDue,
      status: "PENDING",
    });
    const { debt: paidPastDue } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "15.00",
      amountPaid: "15.00",
      outstandingAmount: "0.00",
      dueDate: pastDue,
      status: "PAID",
    });

    const res = await owner.agent.get("/api/v1/debts").query({ overdueOnly: "true" });
    expect(res.status).toBe(200);
    const returned = idsOf(res.body);
    expect(returned).toContain(pendingPastDue.id);
    expect(returned).toContain(partialPastDue.id);
    expect(returned).not.toContain(futureDebt.id);
    expect(returned).not.toContain(paidPastDue.id);
    expect(returned).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  it("never returns a debt whose outstanding balance is exactly 0.00", async () => {
    const owner = await registerAndOnboard(app, "OverdueZeroBalance", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Zero Balance Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const pastDue = new Date(todayStart.getTime() - 1000);

    const { debt: paidZero } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "20.00",
      amountPaid: "20.00",
      outstandingAmount: "0.00",
      dueDate: pastDue,
      status: "PAID",
    });
    const { debt: pendingZero } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "20.00",
      amountPaid: "20.00",
      outstandingAmount: "0.00",
      dueDate: pastDue,
      status: "PENDING",
    });

    const overdueOnly = await owner.agent.get("/api/v1/debts").query({ overdueOnly: "true" });
    const overdue = await owner.agent.get("/api/v1/debts/overdue");
    const dashboard = await owner.agent.get("/api/v1/reports/dashboard");

    expect(idsOf(overdueOnly.body)).not.toContain(paidZero.id);
    expect(idsOf(overdueOnly.body)).not.toContain(pendingZero.id);
    expect(idsOf(overdue.body)).not.toContain(paidZero.id);
    expect(idsOf(overdue.body)).not.toContain(pendingZero.id);
    expect(dashboard.body.data.overdueDebtCount).toBe(0);
  });
});

describe("overdue day-boundary (business timezone, not UTC)", () => {
  it("marks a debt due one second before the business-day start as overdue, and one second after as not", async () => {
    const owner = await registerAndOnboard(app, "OverdueSecondBoundary", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Second Boundary Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const oneSecondBefore = new Date(todayStart.getTime() - 1000);
    const oneSecondAfter = new Date(todayStart.getTime() + 1000);

    const { debt: overdueDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "11.00",
      dueDate: oneSecondBefore,
    });
    const { debt: notOverdueDebt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "12.00",
      dueDate: oneSecondAfter,
    });

    const overdueOnly = await owner.agent.get("/api/v1/debts").query({ overdueOnly: "true" });
    const overdue = await owner.agent.get("/api/v1/debts/overdue");
    const dashboard = await owner.agent.get("/api/v1/reports/dashboard");

    expect(idsOf(overdueOnly.body)).toContain(overdueDebt.id);
    expect(idsOf(overdueOnly.body)).not.toContain(notOverdueDebt.id);
    expect(idsOf(overdue.body)).toContain(overdueDebt.id);
    expect(idsOf(overdue.body)).not.toContain(notOverdueDebt.id);
    expect(dashboard.body.data.overdueDebtCount).toBe(1);

    const creditOverdue = await prisma.$transaction((tx) =>
      checkCreditEligibility(tx, { businessId: owner.businessId, customerId, amount: "1" }),
    );
    expect(creditOverdue.allowed).toBe(false);
    expect(creditOverdue.reason).toBe("OVERDUE_DEBT");
  });
});

describe("five surfaces agree on the same overdue set", () => {
  it("overdueOnly, /debts/overdue, status=OVERDUE, /debts/aging, /reports/receivables/aging, and dashboard overdueDebtCount agree", async () => {
    const owner = await registerAndOnboard(app, "OverdueFiveSurface", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({
      fullName: "Agreement Customer",
      creditLimit: 5000,
    });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const yesterday = new Date(todayStart.getTime() - 1000);
    const laterToday = new Date(todayStart.getTime() + 60 * 60 * 1000);
    const nextWeek = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { debt: pendingOverdue } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "30.00",
      dueDate: yesterday,
      status: "PENDING",
    });
    const { debt: partialOverdue } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "70.00",
      amountPaid: "20.00",
      outstandingAmount: "50.00",
      dueDate: yesterday,
      status: "PARTIALLY_PAID",
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "15.00",
      dueDate: laterToday,
      status: "PENDING",
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "18.00",
      dueDate: nextWeek,
      status: "PENDING",
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "9.00",
      amountPaid: "9.00",
      outstandingAmount: "0.00",
      dueDate: yesterday,
      status: "PAID",
    });

    const overdueOnly = await owner.agent.get("/api/v1/debts").query({ overdueOnly: "true" });
    const overdue = await owner.agent.get("/api/v1/debts/overdue");
    const statusOverdue = await owner.agent.get("/api/v1/debts").query({ status: "OVERDUE" });
    const customerStatusOverdue = await owner.agent
      .get(`/api/v1/customers/${customerId}/debts`)
      .query({ status: "OVERDUE" });
    const aging = await owner.agent.get("/api/v1/debts/aging").query({ customerId });
    const reportsAging = await owner.agent.get("/api/v1/reports/receivables/aging");
    const dashboard = await owner.agent.get("/api/v1/reports/dashboard");

    const overdueOnlyIds = idsOf(overdueOnly.body).sort();
    const overdueIds = idsOf(overdue.body).sort();
    const statusOverdueIds = idsOf(statusOverdue.body).sort();
    const customerStatusOverdueIds = idsOf(customerStatusOverdue.body).sort();
    const expected = [pendingOverdue.id, partialOverdue.id].sort();

    expect(overdueOnly.status).toBe(200);
    expect(overdue.status).toBe(200);
    expect(statusOverdue.status).toBe(200);
    expect(customerStatusOverdue.status).toBe(200);
    expect(aging.status).toBe(200);
    expect(reportsAging.status).toBe(200);
    expect(dashboard.status).toBe(200);

    expect(overdueOnlyIds).toEqual(expected);
    expect(overdueIds).toEqual(expected);
    expect(statusOverdueIds).toEqual(expected);
    expect(customerStatusOverdueIds).toEqual(expected);
    expect(overdueCountFromAgingBuckets(aging.body.data.buckets)).toBe(2);
    expect(overdueCountFromReportBuckets(reportsAging.body.data.buckets)).toBe(2);
    expect(dashboard.body.data.overdueDebtCount).toBe(2);
  });
});

describe("overdue tenant isolation", () => {
  it("never includes business B's debts in business A's overdue lists or counts", async () => {
    const tenantA = await registerAndOnboard(app, "OverdueIsoA", { timezone: BUSINESS_TIMEZONE });
    const tenantB = await registerAndOnboard(app, "OverdueIsoB", { timezone: BUSINESS_TIMEZONE });

    const customerA = await tenantA.agent.post("/api/v1/customers").send({ fullName: "Iso A Debtor" });
    const customerB = await tenantB.agent.post("/api/v1/customers").send({ fullName: "Iso B Debtor" });

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const yesterday = new Date(todayStart.getTime() - 1000);

    const { debt: debtA } = await createDebtFixture({
      businessId: tenantA.businessId,
      branchId: tenantA.branchId,
      warehouseId: tenantA.warehouseId,
      customerId: customerA.body.data.id as string,
      principal: "44.00",
      dueDate: yesterday,
    });
    const { debt: debtB } = await createDebtFixture({
      businessId: tenantB.businessId,
      branchId: tenantB.branchId,
      warehouseId: tenantB.warehouseId,
      customerId: customerB.body.data.id as string,
      principal: "55.00",
      dueDate: yesterday,
    });

    const overdueOnlyA = await tenantA.agent.get("/api/v1/debts").query({ overdueOnly: "true" });
    const overdueA = await tenantA.agent.get("/api/v1/debts/overdue");
    const statusOverdueA = await tenantA.agent.get("/api/v1/debts").query({ status: "OVERDUE" });
    const dashboardA = await tenantA.agent.get("/api/v1/reports/dashboard");
    const agingA = await tenantA.agent.get("/api/v1/debts/aging");
    const reportsA = await tenantA.agent.get("/api/v1/reports/receivables/aging");

    expect(idsOf(overdueOnlyA.body)).toEqual([debtA.id]);
    expect(idsOf(overdueA.body)).toEqual([debtA.id]);
    expect(idsOf(statusOverdueA.body)).toEqual([debtA.id]);
    expect(idsOf(overdueOnlyA.body)).not.toContain(debtB.id);
    expect(idsOf(statusOverdueA.body)).not.toContain(debtB.id);
    expect(dashboardA.body.data.overdueDebtCount).toBe(1);
    expect(overdueCountFromAgingBuckets(agingA.body.data.buckets)).toBe(1);
    expect(overdueCountFromReportBuckets(reportsA.body.data.buckets)).toBe(1);

    const leak = await tenantA.agent.get(`/api/v1/debts/${debtB.id}`);
    expect(leak.status).toBe(404);
  });
});

describe("GET /debts?status=OVERDUE is a live predicate, not a stored-flag match", () => {
  it("does not return a row whose stored status is OVERDUE when dueDate is still in the future", async () => {
    const owner = await registerAndOnboard(app, "StatusOverdueDeadFlag", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Dead Flag Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const futureDue = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const pastDue = new Date(todayStart.getTime() - 1000);

    const { debt: storedOverdueFuture } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "22.00",
      dueDate: futureDue,
      status: "OVERDUE",
    });
    const { debt: pendingPastDue } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "33.00",
      dueDate: pastDue,
      status: "PENDING",
    });

    const statusOverdue = await owner.agent.get("/api/v1/debts").query({ status: "OVERDUE" });
    const overdueOnly = await owner.agent.get("/api/v1/debts").query({ overdueOnly: "true" });
    const overdue = await owner.agent.get("/api/v1/debts/overdue");

    expect(statusOverdue.status).toBe(200);
    expect(idsOf(statusOverdue.body)).toEqual([pendingPastDue.id]);
    expect(idsOf(statusOverdue.body)).not.toContain(storedOverdueFuture.id);
    expect(idsOf(overdueOnly.body)).toEqual(idsOf(statusOverdue.body));
    expect(idsOf(overdue.body)).toEqual(idsOf(statusOverdue.body));
  });
});

describe("GET /debts?status=DUE_TODAY maps onto dueTodayDebtWhere", () => {
  it("agrees with GET /debts/due-today on both the global and per-customer lists", async () => {
    const owner = await registerAndOnboard(app, "StatusDueTodayAlias", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Due Today Alias Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const laterToday = new Date(todayStart.getTime() + 60 * 60 * 1000);
    const yesterday = new Date(todayStart.getTime() - 1000);
    const nextWeek = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { debt: dueToday } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "16.00",
      dueDate: laterToday,
      status: "PENDING",
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "17.00",
      dueDate: yesterday,
      status: "PENDING",
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "18.00",
      dueDate: nextWeek,
      status: "PENDING",
    });

    const statusDueToday = await owner.agent.get("/api/v1/debts").query({ status: "DUE_TODAY" });
    const dueTodayEndpoint = await owner.agent.get("/api/v1/debts/due-today");
    const customerStatusDueToday = await owner.agent
      .get(`/api/v1/customers/${customerId}/debts`)
      .query({ status: "DUE_TODAY" });

    expect(statusDueToday.status).toBe(200);
    expect(dueTodayEndpoint.status).toBe(200);
    expect(customerStatusDueToday.status).toBe(200);
    expect(idsOf(statusDueToday.body)).toEqual([dueToday.id]);
    expect(idsOf(dueTodayEndpoint.body)).toEqual([dueToday.id]);
    expect(idsOf(customerStatusDueToday.body)).toEqual([dueToday.id]);
  });
});

describe("GET /debts?status=DUE_SOON is rejected", () => {
  it("returns 422 on listDebts and listCustomerDebts naming the supported alternatives", async () => {
    const owner = await registerAndOnboard(app, "StatusDueSoonRejected", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Due Soon Rejected Customer" });
    const customerId = customer.body.data.id as string;

    const list = await owner.agent.get("/api/v1/debts").query({ status: "DUE_SOON" });
    const nested = await owner.agent.get(`/api/v1/customers/${customerId}/debts`).query({ status: "DUE_SOON" });

    expect(list.status).toBe(422);
    expect(nested.status).toBe(422);
    expect(list.body.error.message).toContain("status=DUE_SOON is not a supported filter");
    expect(list.body.error.message).toContain("overdueOnly=true");
    expect(list.body.error.message).toContain("/debts/overdue");
    expect(list.body.error.message).toContain("status=DUE_TODAY");
    expect(nested.body.error.message).toContain("status=DUE_SOON is not a supported filter");
  });
});

describe("dashboard outstandingReceivables agrees with aging", () => {
  it("excludes a cancelled debt that still carries a balance, matching both aging totals", async () => {
    const owner = await registerAndOnboard(app, "DashboardAgingCancelled", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Cancelled Balance Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const yesterday = new Date(todayStart.getTime() - 1000);
    const nextWeek = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "40.00",
      dueDate: yesterday,
      status: "PENDING",
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "10.00",
      dueDate: nextWeek,
      status: "PENDING",
    });
    const cancelled = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "25.00",
      dueDate: yesterday,
      status: "PENDING",
    });
    await prisma.customerDebt.update({
      where: { id: cancelled.debt.id },
      data: { status: "CANCELLED", outstandingAmount: "25.00" },
    });

    const dashboard = await owner.agent.get("/api/v1/reports/dashboard");
    const aging = await owner.agent.get("/api/v1/debts/aging");
    const reportsAging = await owner.agent.get("/api/v1/reports/receivables/aging");

    expect(dashboard.status).toBe(200);
    expect(aging.status).toBe(200);
    expect(reportsAging.status).toBe(200);

    expect(dashboard.body.data.outstandingReceivables).toBe("50.00");
    expect(aging.body.data.totalOutstanding).toBe("50.00");
    expect(reportsAging.body.data.totalOutstanding).toBe("50.00");
    expect(dashboard.body.data.outstandingReceivables).toBe(aging.body.data.totalOutstanding);
    expect(dashboard.body.data.outstandingReceivables).toBe(reportsAging.body.data.totalOutstanding);
    expect(dashboard.body.data.overdueDebtCount).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
