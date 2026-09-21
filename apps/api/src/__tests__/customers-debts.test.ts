import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createDebtFixture, createLimitedMember, registerAndOnboard } from "./customers-test-helpers.js";

const app = createApp();

describe("Debt payment reconciliation", () => {
  it("settles a debt exactly to zero after a partial then final payment", async () => {
    const owner = await registerAndOnboard(app, "DebtReconcile");
    const create = await owner.agent.post("/api/v1/customers").send({
      fullName: "Reconcile Customer",
      creditLimit: 1000,
    });
    const customerId = create.body.data.id as string;

    const { debt, invoice } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "100.00",
    });

    const partial = await owner.agent.post(`/api/v1/debts/${debt.id}/payments`).send({
      amount: 40,
      method: "CASH",
    });
    expect(partial.status).toBe(201);
    expect(partial.body.data.debt.outstandingAmount).toBe("60.00");
    expect(partial.body.data.debt.status).toBe("PARTIALLY_PAID");
    expect(partial.body.data.invoice.status).toBe("PARTIALLY_PAID");
    expect(partial.body.data.customerCurrentBalance).toBe("60.00");

    const final = await owner.agent.post(`/api/v1/debts/${debt.id}/payments`).send({
      amount: 60,
      method: "MOBILE_MONEY",
    });
    expect(final.status).toBe(201);
    expect(final.body.data.debt.outstandingAmount).toBe("0.00");
    expect(final.body.data.debt.status).toBe("PAID");
    expect(final.body.data.invoice.status).toBe("PAID");
    expect(final.body.data.customerCurrentBalance).toBe("0.00");

    const finalDebt = await prisma.customerDebt.findUnique({ where: { id: debt.id } });
    expect(finalDebt?.outstandingAmount.toString()).toBe("0");
    expect(finalDebt?.status).toBe("PAID");

    const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(finalInvoice?.amountDue.toString()).toBe("0");
    expect(finalInvoice?.status).toBe("PAID");
    expect(finalInvoice?.paidAt).not.toBeNull();

    const allocations = await prisma.paymentAllocation.findMany({ where: { debtId: debt.id } });
    expect(allocations).toHaveLength(2);

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(customer?.currentBalance.toString()).toBe("0");
  });

  it("rejects an overpayment beyond the outstanding balance", async () => {
    const owner = await registerAndOnboard(app, "DebtOverpay");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Overpay Customer" });
    const customerId = create.body.data.id as string;

    const { debt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "50.00",
    });

    const attempt = await owner.agent.post(`/api/v1/debts/${debt.id}/payments`).send({
      amount: 75,
      method: "CASH",
    });
    expect(attempt.status).toBe(409);

    const unchanged = await prisma.customerDebt.findUnique({ where: { id: debt.id } });
    expect(unchanged?.outstandingAmount.toString()).toBe("50");
    expect(unchanged?.status).toBe("PENDING");
  });

  it("rejects payments against an already-settled debt", async () => {
    const owner = await registerAndOnboard(app, "DebtSettled");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Settled Customer" });
    const customerId = create.body.data.id as string;
    const { debt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "20.00",
    });

    const pay = await owner.agent.post(`/api/v1/debts/${debt.id}/payments`).send({ amount: 20, method: "CASH" });
    expect(pay.status).toBe(201);

    const again = await owner.agent.post(`/api/v1/debts/${debt.id}/payments`).send({ amount: 5, method: "CASH" });
    expect(again.status).toBe(409);
  });

  it("writes an audit log entry for a debt payment", async () => {
    const owner = await registerAndOnboard(app, "DebtAudit");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Audit Debt Customer" });
    const customerId = create.body.data.id as string;
    const { debt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "30.00",
    });

    await owner.agent.post(`/api/v1/debts/${debt.id}/payments`).send({ amount: 30, method: "CASH" });

    const logs = await prisma.auditLog.findMany({
      where: { businessId: owner.businessId, action: "debt.payment_collected", entityId: debt.id },
    });
    expect(logs).toHaveLength(1);
  });

  it("enforces the debts.collect permission", async () => {
    const owner = await registerAndOnboard(app, "DebtCollectPerm");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Collect Perm Customer" });
    const customerId = create.body.data.id as string;
    const { debt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "30.00",
    });

    const limited = await createLimitedMember(app, owner, "DebtCollectPermMember", ["debts.read"]);
    const attempt = await limited.agent.post(`/api/v1/debts/${debt.id}/payments`).send({ amount: 10, method: "CASH" });
    expect(attempt.status).toBe(403);
  });
});

describe("Debt aging report", () => {
  it("buckets outstanding debts into the correct aging ranges", async () => {
    const owner = await registerAndOnboard(app, "DebtAging");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Aging Customer" });
    const customerId = create.body.data.id as string;

    const asOf = new Date();
    const daysAgo = (n: number) => {
      const d = new Date(asOf);
      d.setDate(d.getDate() - n);
      return d;
    };

    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "10.00",
      dueDate: daysAgo(-5),
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "20.00",
      dueDate: daysAgo(15),
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "30.00",
      dueDate: daysAgo(45),
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "40.00",
      dueDate: daysAgo(75),
    });
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "50.00",
      dueDate: daysAgo(120),
    });

    const report = await owner.agent.get("/api/v1/debts/aging").query({ customerId });
    expect(report.status).toBe(200);
    expect(report.body.data.buckets.current.total).toBe("10.00");
    expect(report.body.data.buckets["1-30"].total).toBe("20.00");
    expect(report.body.data.buckets["31-60"].total).toBe("30.00");
    expect(report.body.data.buckets["61-90"].total).toBe("40.00");
    expect(report.body.data.buckets["90+"].total).toBe("50.00");
    expect(report.body.data.totalOutstanding).toBe("150.00");
  });
});

describe("Debt reminders", () => {
  it("creates exactly one Notification + NotificationLog and is idempotent for the same day", async () => {
    const owner = await registerAndOnboard(app, "DebtRemind");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Remind Customer" });
    const customerId = create.body.data.id as string;
    const { debt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "25.00",
    });

    const first = await owner.agent.post(`/api/v1/debts/${debt.id}/remind`).send({ channel: "SMS" });
    expect(first.status).toBe(201);
    expect(first.body.data.duplicated).toBe(false);

    const second = await owner.agent.post(`/api/v1/debts/${debt.id}/remind`).send({ channel: "SMS" });
    expect(second.status).toBe(200);
    expect(second.body.data.duplicated).toBe(true);

    const notifications = await prisma.notification.findMany({
      where: { businessId: owner.businessId, customerId },
    });
    expect(notifications).toHaveLength(1);

    const logs = await prisma.notificationLog.findMany({
      where: { notificationId: notifications[0]!.id },
    });
    expect(logs).toHaveLength(1);

    const finalDebt = await prisma.customerDebt.findUnique({ where: { id: debt.id } });
    expect(finalDebt?.remindersSent).toBe(1);
  });

  it("rejects reminders for a fully paid debt", async () => {
    const owner = await registerAndOnboard(app, "DebtRemindPaid");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Remind Paid Customer" });
    const customerId = create.body.data.id as string;
    const { debt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "15.00",
    });
    await owner.agent.post(`/api/v1/debts/${debt.id}/payments`).send({ amount: 15, method: "CASH" });

    const remind = await owner.agent.post(`/api/v1/debts/${debt.id}/remind`).send({});
    expect(remind.status).toBe(409);
  });

  it("enforces the debts.remind permission", async () => {
    const owner = await registerAndOnboard(app, "DebtRemindPerm");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Remind Perm Customer" });
    const customerId = create.body.data.id as string;
    const { debt } = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "15.00",
    });

    const limited = await createLimitedMember(app, owner, "DebtRemindPermMember", ["debts.read"]);
    const attempt = await limited.agent.post(`/api/v1/debts/${debt.id}/remind`).send({});
    expect(attempt.status).toBe(403);
  });
});

describe("Debt tenant isolation", () => {
  it("prevents Business B from reading or paying Business A's debt", async () => {
    const tenantA = await registerAndOnboard(app, "DebtIsoA");
    const tenantB = await registerAndOnboard(app, "DebtIsoB");

    const create = await tenantA.agent.post("/api/v1/customers").send({ fullName: "Tenant A Debtor" });
    const customerId = create.body.data.id as string;
    const { debt } = await createDebtFixture({
      businessId: tenantA.businessId,
      branchId: tenantA.branchId,
      warehouseId: tenantA.warehouseId,
      customerId,
      principal: "60.00",
    });

    const readLeak = await tenantB.agent.get(`/api/v1/debts/${debt.id}`);
    expect(readLeak.status).toBe(404);

    const payLeak = await tenantB.agent.post(`/api/v1/debts/${debt.id}/payments`).send({ amount: 10, method: "CASH" });
    expect(payLeak.status).toBe(404);

    const remindLeak = await tenantB.agent.post(`/api/v1/debts/${debt.id}/remind`).send({});
    expect(remindLeak.status).toBe(404);

    const unchanged = await prisma.customerDebt.findUnique({ where: { id: debt.id } });
    expect(unchanged?.outstandingAmount.toString()).toBe("60");
  });

  it("does not leak Business A's debts into Business B's list or aging report", async () => {
    const tenantA = await registerAndOnboard(app, "DebtIsoListA");
    const tenantB = await registerAndOnboard(app, "DebtIsoListB");

    const create = await tenantA.agent.post("/api/v1/customers").send({ fullName: "Tenant A List Debtor" });
    const customerId = create.body.data.id as string;
    await createDebtFixture({
      businessId: tenantA.businessId,
      branchId: tenantA.branchId,
      warehouseId: tenantA.warehouseId,
      customerId,
      principal: "70.00",
    });

    const listB = await tenantB.agent.get("/api/v1/debts");
    expect(listB.status).toBe(200);
    expect(listB.body.data).toHaveLength(0);

    const agingB = await tenantB.agent.get("/api/v1/debts/aging");
    expect(agingB.status).toBe(200);
    expect(agingB.body.data.totalOutstanding).toBe("0.00");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
