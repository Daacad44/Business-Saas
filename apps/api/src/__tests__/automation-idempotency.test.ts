import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { processTriggerMatch } from "../modules/automation/run-trigger-match.js";

const app = createApp();

function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

const password = "CorrectHorse-1";

async function registerAndOnboard(label: string) {
  const email = uniqueEmail(label);
  const agent = request.agent(app);
  const register = await agent.post("/api/v1/auth/register").send({ fullName: label, email, password });
  expect(register.status).toBe(201);

  const onboard = await agent.post("/api/v1/businesses").send({
    name: `${label} Trading`,
    type: "RETAIL",
    locale: "en",
    branch: { name: "Main", code: "MAIN" },
    warehouse: { name: "Main warehouse", code: "WH1" },
  });
  expect(onboard.status).toBe(201);

  return {
    businessId: onboard.body.data.business.id as string,
    branchId: onboard.body.data.branch.id as string,
    warehouseId: onboard.body.data.warehouse.id as string,
  };
}

async function createDebt(
  businessId: string,
  branchId: string,
  warehouseId: string,
  options: { dueDate: Date; outstanding?: number },
) {
  const suffix = uniqueSuffix();
  const customer = await prisma.customer.create({
    data: {
      businessId,
      fullName: "Idempotency Test Customer",
      phone: `25191${suffix}`.slice(0, 15),
      email: `idempotency.${suffix}@daljir.test`,
    },
  });
  const sale = await prisma.sale.create({
    data: { businessId, branchId, warehouseId, customerId: customer.id, saleNumber: `S-${suffix}`, subtotal: 100, totalAmount: 100 },
  });
  const invoice = await prisma.invoice.create({
    data: {
      businessId,
      saleId: sale.id,
      customerId: customer.id,
      invoiceNumber: `INV-${suffix}`,
      subtotal: 100,
      totalAmount: 100,
      amountDue: options.outstanding ?? 100,
      dueDate: options.dueDate,
    },
  });
  const debt = await prisma.customerDebt.create({
    data: {
      businessId,
      customerId: customer.id,
      invoiceId: invoice.id,
      principalAmount: 100,
      outstandingAmount: options.outstanding ?? 100,
      dueDate: options.dueDate,
    },
  });
  return { customer, sale, invoice, debt };
}

describe("automation idempotency", () => {
  it("creates exactly ONE AutomationExecution and ONE Notification when the same job runs twice", async () => {
    const tenant = await registerAndOnboard("Idempotency");
    const { debt } = await createDebt(tenant.businessId, tenant.branchId, tenant.warehouseId, {
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const rule = await prisma.automationRule.create({
      data: { businessId: tenant.businessId, name: `Idempotent overdue rule ${uniqueSuffix()}`, isActive: true },
      include: { actions: true },
    });
    const trigger = await prisma.automationTrigger.create({
      data: { businessId: tenant.businessId, ruleId: rule.id, type: "INVOICE_OVERDUE" },
    });
    await prisma.automationAction.create({
      data: { businessId: tenant.businessId, ruleId: rule.id, type: "CREATE_NOTIFICATION", order: 0 },
    });

    const ruleWithActions = await prisma.automationRule.findUniqueOrThrow({
      where: { id: rule.id },
      include: { actions: true },
    });

    const first = await processTriggerMatch({ businessId: tenant.businessId, rule: ruleWithActions, trigger, debt });
    expect(first.created).toBe(true);
    expect(first.status).toBe("SUCCESS");
    expect(first.notificationIds).toHaveLength(1);

    const second = await processTriggerMatch({ businessId: tenant.businessId, rule: ruleWithActions, trigger, debt });
    expect(second.created).toBe(false);
    expect(second.notificationIds).toHaveLength(0);

    const [executionCount, notificationCount] = await Promise.all([
      prisma.automationExecution.count({ where: { businessId: tenant.businessId, ruleId: rule.id, debtId: debt.id } }),
      prisma.notification.count({ where: { businessId: tenant.businessId, executionId: first.executionId } }),
    ]);

    expect(executionCount).toBe(1);
    expect(notificationCount).toBe(1);
  });

  it("never crashes on the duplicate unique-constraint violation", async () => {
    const tenant = await registerAndOnboard("IdempotencyCrash");
    const { debt } = await createDebt(tenant.businessId, tenant.branchId, tenant.warehouseId, {
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const rule = await prisma.automationRule.create({
      data: { businessId: tenant.businessId, name: `Crash-safe rule ${uniqueSuffix()}`, isActive: true },
    });
    const trigger = await prisma.automationTrigger.create({
      data: { businessId: tenant.businessId, ruleId: rule.id, type: "INVOICE_OVERDUE" },
    });
    const ruleWithActions = await prisma.automationRule.findUniqueOrThrow({
      where: { id: rule.id },
      include: { actions: true },
    });

    const results = await Promise.allSettled([
      processTriggerMatch({ businessId: tenant.businessId, rule: ruleWithActions, trigger, debt }),
      processTriggerMatch({ businessId: tenant.businessId, rule: ruleWithActions, trigger, debt }),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const executionCount = await prisma.automationExecution.count({
      where: { businessId: tenant.businessId, ruleId: rule.id, debtId: debt.id },
    });
    expect(executionCount).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
