import type { InvoiceStatus } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { dayBoundsInTimezone, startOfDayInTimezone } from "../modules/customers/timezone.js";
import { overdueInvoiceWhere } from "../modules/sales/invoice-query.js";
import { registerAndOnboard } from "./customers-test-helpers.js";

const app = createApp();
const BUSINESS_TIMEZONE = "Africa/Mogadishu";

type InvoiceRow = { id: string; amountDue: string; status: string };

function idsOf(body: { data: InvoiceRow[] }) {
  return body.data.map((d) => d.id);
}

let fixtureCounter = 0;

async function createInvoiceFixture(args: {
  businessId: string;
  branchId: string;
  warehouseId: string;
  customerId?: string;
  amountDue: string;
  dueDate?: Date | null;
  status?: InvoiceStatus;
  amountPaid?: string;
  totalAmount?: string;
}) {
  fixtureCounter += 1;
  const suffix = `${Date.now()}-${fixtureCounter}`;
  const totalAmount = args.totalAmount ?? args.amountDue;
  const amountPaid = args.amountPaid ?? "0";

  const sale = await prisma.sale.create({
    data: {
      businessId: args.businessId,
      branchId: args.branchId,
      warehouseId: args.warehouseId,
      customerId: args.customerId,
      saleNumber: `S-INV-${suffix}`,
      type: "CREDIT",
      status: "COMPLETED",
      subtotal: totalAmount,
      totalAmount,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      businessId: args.businessId,
      saleId: sale.id,
      customerId: args.customerId,
      invoiceNumber: `INV-OV-${suffix}`,
      status: args.status ?? "ISSUED",
      subtotal: totalAmount,
      totalAmount,
      amountPaid,
      amountDue: args.amountDue,
      dueDate: args.dueDate === undefined ? new Date() : args.dueDate,
    },
  });

  return { sale, invoice };
}

describe("overdueInvoiceWhere uses the business-timezone day boundary, not UTC", () => {
  it("marks an invoice overdue in Africa/Mogadishu that UTC midnight would still treat as current", () => {
    // 22:00 UTC on 20 Sep = 01:00 on 21 Sep in Mogadishu (near UTC midnight).
    const asOf = new Date("2026-09-20T22:00:00.000Z");
    const utcStart = new Date("2026-09-20T00:00:00.000Z");
    const businessStart = startOfDayInTimezone(asOf, BUSINESS_TIMEZONE);
    expect(businessStart.toISOString()).toBe("2026-09-20T21:00:00.000Z");

    const dueDate = new Date("2026-09-20T20:30:00.000Z");
    expect(dueDate.getTime()).toBeLessThan(businessStart.getTime());
    expect(dueDate.getTime()).toBeGreaterThanOrEqual(utcStart.getTime());

    const where = overdueInvoiceWhere(asOf, BUSINESS_TIMEZONE);
    expect(where.dueDate).toEqual({ lt: businessStart });
    expect((where.dueDate as { lt: Date }).lt.toISOString()).toBe("2026-09-20T21:00:00.000Z");
    expect(where.amountDue).toEqual({ gt: expect.anything() });
    expect(where.status).toEqual({ notIn: ["PAID", "VOID"] });
  });

  it("pins overdueInvoiceWhere.dueDate.lt to startOfDayInTimezone, not the asOf instant", () => {
    const asOf = new Date("2026-09-21T12:00:00.000Z");
    const where = overdueInvoiceWhere(asOf, BUSINESS_TIMEZONE);
    expect(where.dueDate).toEqual({ lt: startOfDayInTimezone(asOf, BUSINESS_TIMEZONE) });
    expect((where.dueDate as { lt: Date }).lt.toISOString()).not.toBe(asOf.toISOString());
  });
});

describe("GET /invoices?overdueOnly=true uses the live predicate, not dueDate < now", () => {
  it("returns an invoice overdue by the business timezone and not by UTC near midnight, and excludes one due after business-day start", async () => {
    const owner = await registerAndOnboard(app, "InvOverdueTz", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Invoice TZ Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const oneSecondBefore = new Date(todayStart.getTime() - 1000);
    const oneSecondAfter = new Date(todayStart.getTime() + 1000);

    const { invoice: overdueInvoice } = await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "11.00",
      dueDate: oneSecondBefore,
      status: "ISSUED",
    });
    const { invoice: notOverdueInvoice } = await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "12.00",
      dueDate: oneSecondAfter,
      status: "ISSUED",
    });

    const overdueOnly = await owner.agent.get("/api/v1/invoices").query({ overdueOnly: "true" });
    const statusOverdue = await owner.agent.get("/api/v1/invoices").query({ status: "OVERDUE" });
    const dashboard = await owner.agent.get("/api/v1/reports/dashboard");

    expect(overdueOnly.status).toBe(200);
    expect(statusOverdue.status).toBe(200);
    expect(idsOf(overdueOnly.body)).toContain(overdueInvoice.id);
    expect(idsOf(overdueOnly.body)).not.toContain(notOverdueInvoice.id);
    expect(idsOf(statusOverdue.body)).toEqual(idsOf(overdueOnly.body));
    expect(overdueOnly.body.meta.total).toBe(1);

    const helperCount = await prisma.invoice.count({
      where: { businessId: owner.businessId, ...overdueInvoiceWhere(new Date(), BUSINESS_TIMEZONE) },
    });
    expect(overdueOnly.body.meta.total).toBe(helperCount);
    expect(statusOverdue.body.meta.total).toBe(helperCount);

    // Dashboard overdueDebtCount is a debt figure, not an invoice overdue aggregate.
    // These fixtures create invoices without CustomerDebt rows, so the debt count
    // stays 0 and must not be treated as a second invoice cut.
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.overdueDebtCount).toBe(0);
  });
});

describe("GET /invoices?status=OVERDUE is a live predicate, not a stored-flag match", () => {
  it("does not return a row whose stored status is OVERDUE when dueDate is still in the future", async () => {
    const owner = await registerAndOnboard(app, "InvStoredOverdue", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Stored Overdue Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const futureDue = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const pastDue = new Date(todayStart.getTime() - 1000);

    const { invoice: storedOverdueFuture } = await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "22.00",
      dueDate: futureDue,
      status: "OVERDUE",
    });
    const { invoice: issuedPastDue } = await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "33.00",
      dueDate: pastDue,
      status: "ISSUED",
    });

    const statusOverdue = await owner.agent.get("/api/v1/invoices").query({ status: "OVERDUE" });
    const overdueOnly = await owner.agent.get("/api/v1/invoices").query({ overdueOnly: "true" });

    expect(statusOverdue.status).toBe(200);
    expect(idsOf(statusOverdue.body)).toEqual([issuedPastDue.id]);
    expect(idsOf(statusOverdue.body)).not.toContain(storedOverdueFuture.id);
    expect(idsOf(overdueOnly.body)).toEqual(idsOf(statusOverdue.body));
    expect(statusOverdue.body.data[0].status).toBe("ISSUED");
  });
});

describe("invoice overdue list surfaces agree", () => {
  it("overdueOnly and status=OVERDUE return the same ISSUED and PARTIALLY_PAID set and exclude PAID/VOID/zero-due", async () => {
    const owner = await registerAndOnboard(app, "InvOverdueAgree", { timezone: BUSINESS_TIMEZONE });
    const customer = await owner.agent.post("/api/v1/customers").send({ fullName: "Agreement Invoice Customer" });
    const customerId = customer.body.data.id as string;

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const yesterday = new Date(todayStart.getTime() - 1000);
    const laterToday = new Date(todayStart.getTime() + 60 * 60 * 1000);
    const nextWeek = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { invoice: issuedOverdue } = await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "30.00",
      dueDate: yesterday,
      status: "ISSUED",
    });
    const { invoice: partialOverdue } = await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "50.00",
      amountPaid: "20.00",
      totalAmount: "70.00",
      dueDate: yesterday,
      status: "PARTIALLY_PAID",
    });
    await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "15.00",
      dueDate: laterToday,
      status: "ISSUED",
    });
    await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "18.00",
      dueDate: nextWeek,
      status: "ISSUED",
    });
    await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "0.00",
      amountPaid: "9.00",
      totalAmount: "9.00",
      dueDate: yesterday,
      status: "PAID",
    });
    await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "8.00",
      dueDate: yesterday,
      status: "VOID",
    });
    await createInvoiceFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      amountDue: "0.00",
      amountPaid: "7.00",
      totalAmount: "7.00",
      dueDate: yesterday,
      status: "ISSUED",
    });

    const overdueOnly = await owner.agent.get("/api/v1/invoices").query({ overdueOnly: "true" });
    const statusOverdue = await owner.agent.get("/api/v1/invoices").query({ status: "OVERDUE" });
    const dashboard = await owner.agent.get("/api/v1/reports/dashboard");

    const expected = [issuedOverdue.id, partialOverdue.id].sort();
    expect(overdueOnly.status).toBe(200);
    expect(statusOverdue.status).toBe(200);
    expect(idsOf(overdueOnly.body).sort()).toEqual(expected);
    expect(idsOf(statusOverdue.body).sort()).toEqual(expected);
    expect(overdueOnly.body.meta.total).toBe(2);
    expect(statusOverdue.body.meta.total).toBe(2);

    const helperCount = await prisma.invoice.count({
      where: { businessId: owner.businessId, ...overdueInvoiceWhere(new Date(), BUSINESS_TIMEZONE) },
    });
    expect(helperCount).toBe(2);

    // No invoice-overdue dashboard/report aggregate exists on this branch.
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.overdueDebtCount).toBe(0);
  });
});

describe("invoice overdue tenant isolation", () => {
  it("never includes business B's overdue invoices in business A's list", async () => {
    const tenantA = await registerAndOnboard(app, "InvOverdueIsoA", { timezone: BUSINESS_TIMEZONE });
    const tenantB = await registerAndOnboard(app, "InvOverdueIsoB", { timezone: BUSINESS_TIMEZONE });

    const customerA = await tenantA.agent.post("/api/v1/customers").send({ fullName: "Iso A Invoice" });
    const customerB = await tenantB.agent.post("/api/v1/customers").send({ fullName: "Iso B Invoice" });

    const { start: todayStart } = dayBoundsInTimezone(new Date(), BUSINESS_TIMEZONE);
    const yesterday = new Date(todayStart.getTime() - 1000);

    const { invoice: invoiceA } = await createInvoiceFixture({
      businessId: tenantA.businessId,
      branchId: tenantA.branchId,
      warehouseId: tenantA.warehouseId,
      customerId: customerA.body.data.id as string,
      amountDue: "44.00",
      dueDate: yesterday,
    });
    const { invoice: invoiceB } = await createInvoiceFixture({
      businessId: tenantB.businessId,
      branchId: tenantB.branchId,
      warehouseId: tenantB.warehouseId,
      customerId: customerB.body.data.id as string,
      amountDue: "55.00",
      dueDate: yesterday,
    });

    const overdueOnlyA = await tenantA.agent.get("/api/v1/invoices").query({ overdueOnly: "true" });
    const statusOverdueA = await tenantA.agent.get("/api/v1/invoices").query({ status: "OVERDUE" });
    const overdueOnlyB = await tenantB.agent.get("/api/v1/invoices").query({ overdueOnly: "true" });

    expect(idsOf(overdueOnlyA.body)).toEqual([invoiceA.id]);
    expect(idsOf(statusOverdueA.body)).toEqual([invoiceA.id]);
    expect(idsOf(overdueOnlyA.body)).not.toContain(invoiceB.id);
    expect(idsOf(statusOverdueA.body)).not.toContain(invoiceB.id);
    expect(idsOf(overdueOnlyB.body)).toEqual([invoiceB.id]);
    expect(idsOf(overdueOnlyB.body)).not.toContain(invoiceA.id);

    const leak = await tenantA.agent.get(`/api/v1/invoices/${invoiceB.id}`);
    expect(leak.status).toBe(404);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
