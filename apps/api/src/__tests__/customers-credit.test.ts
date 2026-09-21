import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { checkCreditEligibility, recalculateCustomerBalance } from "../modules/customers/credit.service.js";
import { createDebtFixture, createLimitedMember, registerAndOnboard } from "./customers-test-helpers.js";

const app = createApp();

describe("Credit limit management", () => {
  it("sets and reads the credit limit and available credit", async () => {
    const owner = await registerAndOnboard(app, "CreditLimitA");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Credit Customer" });
    const customerId = create.body.data.id as string;

    const setLimit = await owner.agent.patch(`/api/v1/customers/${customerId}/credit-limit`).send({
      creditLimit: 1000,
    });
    expect(setLimit.status).toBe(200);
    expect(setLimit.body.data.creditLimit).toBe("1000.00");

    const available = await owner.agent.get(`/api/v1/customers/${customerId}/credit`);
    expect(available.status).toBe(200);
    expect(available.body.data.creditLimit).toBe("1000.00");
    expect(available.body.data.currentBalance).toBe("0.00");
    expect(available.body.data.availableCredit).toBe("1000.00");
  });

  it("enforces the customers.update permission on the credit-limit endpoint", async () => {
    const owner = await registerAndOnboard(app, "CreditLimitPerm");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Perm Customer" });
    const customerId = create.body.data.id as string;
    const limited = await createLimitedMember(app, owner, "CreditLimitPermMember", ["customers.read"]);

    const attempt = await limited.agent
      .patch(`/api/v1/customers/${customerId}/credit-limit`)
      .send({ creditLimit: 200 });
    expect(attempt.status).toBe(403);
  });

  it("writes an audit log entry when the credit limit changes", async () => {
    const owner = await registerAndOnboard(app, "CreditLimitAudit");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Audit Customer" });
    const customerId = create.body.data.id as string;

    await owner.agent.patch(`/api/v1/customers/${customerId}/credit-limit`).send({ creditLimit: 300 });

    const logs = await prisma.auditLog.findMany({
      where: { businessId: owner.businessId, action: "customer.credit_limit_update", entityId: customerId },
    });
    expect(logs).toHaveLength(1);
  });
});

describe("checkCreditEligibility", () => {
  it("allows a credit sale within the available limit", async () => {
    const owner = await registerAndOnboard(app, "CreditCheckAllow");
    const create = await owner.agent.post("/api/v1/customers").send({
      fullName: "Eligible Customer",
      creditLimit: 500,
    });
    const customerId = create.body.data.id as string;

    const result = await prisma.$transaction((tx) =>
      checkCreditEligibility(tx, { businessId: owner.businessId, customerId, amount: "200" }),
    );

    expect(result.allowed).toBe(true);
    expect(result.creditLimit).toBe("500.00");
    expect(result.availableCredit).toBe("500.00");
  });

  it("returns LIMIT_EXCEEDED when the requested amount exceeds available credit", async () => {
    const owner = await registerAndOnboard(app, "CreditCheckExceed");
    const create = await owner.agent.post("/api/v1/customers").send({
      fullName: "Limited Customer",
      creditLimit: 100,
    });
    const customerId = create.body.data.id as string;

    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "80.00",
      status: "PENDING",
    });

    const result = await prisma.$transaction((tx) =>
      checkCreditEligibility(tx, { businessId: owner.businessId, customerId, amount: "50" }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("LIMIT_EXCEEDED");
    expect(result.currentBalance).toBe("80.00");
    expect(result.availableCredit).toBe("20.00");
  });

  it("returns CUSTOMER_NOT_FOUND for an unknown or cross-tenant customer id", async () => {
    const owner = await registerAndOnboard(app, "CreditCheckNotFound");
    const result = await prisma.$transaction((tx) =>
      checkCreditEligibility(tx, {
        businessId: owner.businessId,
        customerId: "does-not-exist",
        amount: "10",
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("CUSTOMER_NOT_FOUND");
  });

  it("returns CUSTOMER_DISABLED for an archived customer", async () => {
    const owner = await registerAndOnboard(app, "CreditCheckDisabled");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Disabled Customer" });
    const customerId = create.body.data.id as string;
    await owner.agent.delete(`/api/v1/customers/${customerId}`);

    const result = await prisma.$transaction((tx) =>
      checkCreditEligibility(tx, { businessId: owner.businessId, customerId, amount: "1" }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("CUSTOMER_DISABLED");
  });

  it("returns OVERDUE_DEBT when the customer has an overdue debt", async () => {
    const owner = await registerAndOnboard(app, "CreditCheckOverdue");
    const create = await owner.agent.post("/api/v1/customers").send({
      fullName: "Overdue Customer",
      creditLimit: 1000,
    });
    const customerId = create.body.data.id as string;

    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 10);
    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "50.00",
      dueDate: pastDue,
      status: "OVERDUE",
    });

    const result = await prisma.$transaction((tx) =>
      checkCreditEligibility(tx, { businessId: owner.businessId, customerId, amount: "10" }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("OVERDUE_DEBT");
  });
});

describe("recalculateCustomerBalance", () => {
  it("sums outstanding debts excluding cancelled ones", async () => {
    const owner = await registerAndOnboard(app, "RecalcBalance");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Recalc Customer" });
    const customerId = create.body.data.id as string;

    await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "40.00",
      status: "PENDING",
    });
    const cancelled = await createDebtFixture({
      businessId: owner.businessId,
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      principal: "999.00",
      status: "PENDING",
    });
    await prisma.customerDebt.update({ where: { id: cancelled.debt.id }, data: { status: "CANCELLED" } });

    const result = await prisma.$transaction((tx) =>
      recalculateCustomerBalance(tx, { businessId: owner.businessId, customerId }),
    );
    expect(result.currentBalance).toBe("40.00");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(customer?.currentBalance.toString()).toBe("40");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
