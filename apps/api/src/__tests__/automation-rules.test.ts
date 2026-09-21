import { createTriggerEvaluator } from "@daljir/automation";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

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
  const register = await agent.post("/api/v1/auth/register").send({
    fullName: label,
    email,
    password,
  });
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
    agent,
    email,
    userId: register.body.data.user.id as string,
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
      fullName: "Debt Test Customer",
      phone: `25190${suffix}`.slice(0, 15),
      email: `debt.${suffix}@daljir.test`,
    },
  });
  const sale = await prisma.sale.create({
    data: {
      businessId,
      branchId,
      warehouseId,
      customerId: customer.id,
      saleNumber: `S-${suffix}`,
      subtotal: 100,
      totalAmount: 100,
    },
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

/** Strips a membership of `automation.manage` by pointing it at a permission-limited custom role. */
async function revokeAutomationPermission(businessId: string, userId: string) {
  const role = await prisma.role.create({
    data: {
      businessId,
      name: `No Automation ${uniqueSuffix()}`,
      slug: `no-automation-${uniqueSuffix()}`,
      isSystem: false,
    },
  });
  const readPermission = await prisma.permission.findUnique({ where: { key: "reports.read" } });
  if (readPermission) {
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: readPermission.id } });
  }
  await prisma.membership.updateMany({ where: { businessId, userId }, data: { roleId: role.id } });
}

describe("automation rules", () => {
  it("supports the full CRUD + activate/deactivate lifecycle", async () => {
    const tenant = await registerAndOnboard("AutoCrud");

    const create = await tenant.agent.post("/api/v1/automation/rules").send({
      name: "Overdue reminder",
      description: "Reminds customers about overdue debts",
      isActive: true,
      triggers: [{ type: "INVOICE_OVERDUE", config: {} }],
      actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
    });
    expect(create.status).toBe(201);
    const ruleId = create.body.data.id as string;
    expect(create.body.data.triggers).toHaveLength(1);
    expect(create.body.data.actions).toHaveLength(1);

    const get = await tenant.agent.get(`/api/v1/automation/rules/${ruleId}`);
    expect(get.status).toBe(200);
    expect(get.body.data.name).toBe("Overdue reminder");

    const list = await tenant.agent.get("/api/v1/automation/rules");
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
    expect((list.body.data as Array<{ id: string }>).map((r) => r.id)).toContain(ruleId);

    const update = await tenant.agent.patch(`/api/v1/automation/rules/${ruleId}`).send({
      name: "Overdue reminder v2",
      triggers: [{ type: "INVOICE_OVERDUE", config: {} }, { type: "INVOICE_DUE_TODAY", config: {} }],
    });
    expect(update.status).toBe(200);
    expect(update.body.data.name).toBe("Overdue reminder v2");
    expect(update.body.data.triggers).toHaveLength(2);

    const deactivate = await tenant.agent.post(`/api/v1/automation/rules/${ruleId}/deactivate`);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);

    const activate = await tenant.agent.post(`/api/v1/automation/rules/${ruleId}/activate`);
    expect(activate.status).toBe(200);
    expect(activate.body.data.isActive).toBe(true);

    const del = await tenant.agent.delete(`/api/v1/automation/rules/${ruleId}`);
    expect(del.status).toBe(200);

    const getAfterDelete = await tenant.agent.get(`/api/v1/automation/rules/${ruleId}`);
    expect(getAfterDelete.status).toBe(404);
  });

  it("rejects duplicate rule names within the same business", async () => {
    const tenant = await registerAndOnboard("AutoDup");
    const payload = {
      name: "Due soon reminder",
      triggers: [{ type: "INVOICE_DUE_SOON", offsetDays: 3, config: {} }],
      actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
    };
    const first = await tenant.agent.post("/api/v1/automation/rules").send(payload);
    expect(first.status).toBe(201);
    const second = await tenant.agent.post("/api/v1/automation/rules").send(payload);
    expect(second.status).toBe(409);
  });

  describe("tenant isolation", () => {
    it("returns 404 when Tenant B reads Tenant A's rule", async () => {
      const tenantA = await registerAndOnboard("AutoIsoReadA");
      const tenantB = await registerAndOnboard("AutoIsoReadB");

      const create = await tenantA.agent.post("/api/v1/automation/rules").send({
        name: "A-only rule",
        triggers: [{ type: "INVOICE_OVERDUE", config: {} }],
        actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
      });
      expect(create.status).toBe(201);
      const ruleId = create.body.data.id as string;

      const leak = await tenantB.agent.get(`/api/v1/automation/rules/${ruleId}`);
      expect(leak.status).toBe(404);

      const list = await tenantB.agent.get("/api/v1/automation/rules");
      expect((list.body.data as Array<{ id: string }>).map((r) => r.id)).not.toContain(ruleId);
    });

    it("returns 404 when Tenant B updates or deletes Tenant A's rule", async () => {
      const tenantA = await registerAndOnboard("AutoIsoWriteA");
      const tenantB = await registerAndOnboard("AutoIsoWriteB");

      const create = await tenantA.agent.post("/api/v1/automation/rules").send({
        name: "A-only rule for writes",
        triggers: [{ type: "INVOICE_OVERDUE", config: {} }],
        actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
      });
      const ruleId = create.body.data.id as string;

      const updateLeak = await tenantB.agent.patch(`/api/v1/automation/rules/${ruleId}`).send({ name: "Hacked" });
      expect(updateLeak.status).toBe(404);

      const deleteLeak = await tenantB.agent.delete(`/api/v1/automation/rules/${ruleId}`);
      expect(deleteLeak.status).toBe(404);

      const stillThere = await tenantA.agent.get(`/api/v1/automation/rules/${ruleId}`);
      expect(stillThere.status).toBe(200);
      expect(stillThere.body.data.name).toBe("A-only rule for writes");
    });

    it("returns 404 when Tenant B reads Tenant A's execution", async () => {
      const tenantA = await registerAndOnboard("AutoIsoExecA");
      const tenantB = await registerAndOnboard("AutoIsoExecB");

      const rule = await prisma.automationRule.create({
        data: { businessId: tenantA.businessId, name: `Exec rule ${uniqueSuffix()}`, isActive: true },
      });
      const execution = await prisma.automationExecution.create({
        data: {
          businessId: tenantA.businessId,
          ruleId: rule.id,
          status: "SUCCESS",
          idempotencyKey: `iso-test-${uniqueSuffix()}`,
        },
      });

      const leak = await tenantB.agent.get(`/api/v1/automation/executions/${execution.id}`);
      expect(leak.status).toBe(404);

      const ok = await tenantA.agent.get(`/api/v1/automation/executions/${execution.id}`);
      expect(ok.status).toBe(200);
    });
  });

  describe("permission enforcement", () => {
    it("returns 403 for a member without automation.manage", async () => {
      const tenant = await registerAndOnboard("AutoPerm");
      await revokeAutomationPermission(tenant.businessId, tenant.userId);

      const attempt = await tenant.agent.get("/api/v1/automation/rules");
      expect(attempt.status).toBe(403);
    });
  });

  describe("dry-run / test endpoint", () => {
    it("reports matches and would-fire actions without writing any message rows", async () => {
      const tenant = await registerAndOnboard("AutoDryRun");
      const { debt } = await createDebt(tenant.businessId, tenant.branchId, tenant.warehouseId, {
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      const create = await tenant.agent.post("/api/v1/automation/rules").send({
        name: "Dry run overdue rule",
        triggers: [{ type: "INVOICE_OVERDUE", config: {} }],
        actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
      });
      const ruleId = create.body.data.id as string;

      const [notifBefore, logBefore, execBefore] = await Promise.all([
        prisma.notification.count({ where: { businessId: tenant.businessId } }),
        prisma.notificationLog.count({ where: { businessId: tenant.businessId } }),
        prisma.automationExecution.count({ where: { businessId: tenant.businessId } }),
      ]);

      const dryRun = await tenant.agent.post(`/api/v1/automation/rules/${ruleId}/test`).send({ debtId: debt.id });
      expect(dryRun.status).toBe(200);
      expect(dryRun.body.data.triggers[0].matchedCount).toBe(1);
      expect(dryRun.body.data.triggers[0].matchedDebts[0].id).toBe(debt.id);
      expect(dryRun.body.data.wouldFireActions).toHaveLength(1);

      const [notifAfter, logAfter, execAfter] = await Promise.all([
        prisma.notification.count({ where: { businessId: tenant.businessId } }),
        prisma.notificationLog.count({ where: { businessId: tenant.businessId } }),
        prisma.automationExecution.count({ where: { businessId: tenant.businessId } }),
      ]);

      expect(notifAfter).toBe(notifBefore);
      expect(logAfter).toBe(logBefore);
      expect(execAfter).toBe(execBefore);
    });

    it("returns 404 for a debt belonging to another tenant", async () => {
      const tenantA = await registerAndOnboard("AutoDryRunIsoA");
      const tenantB = await registerAndOnboard("AutoDryRunIsoB");

      const { debt } = await createDebt(tenantA.businessId, tenantA.branchId, tenantA.warehouseId, {
        dueDate: new Date(),
      });

      const create = await tenantB.agent.post("/api/v1/automation/rules").send({
        name: "B rule",
        triggers: [{ type: "INVOICE_OVERDUE", config: {} }],
        actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
      });
      const ruleId = create.body.data.id as string;

      const dryRun = await tenantB.agent.post(`/api/v1/automation/rules/${ruleId}/test`).send({ debtId: debt.id });
      expect(dryRun.status).toBe(404);
    });

    it("returns the same overdue match set as the shared evaluator and isolates tenants", async () => {
      const tenantA = await registerAndOnboard("AutoEvalAgreeOverdueA");
      const tenantB = await registerAndOnboard("AutoEvalAgreeOverdueB");
      const evaluator = createTriggerEvaluator({ prisma });

      const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000);

      const { debt: overdueA } = await createDebt(tenantA.businessId, tenantA.branchId, tenantA.warehouseId, {
        dueDate: yesterday,
      });
      const { debt: futureA } = await createDebt(tenantA.businessId, tenantA.branchId, tenantA.warehouseId, {
        dueDate: tomorrow,
      });
      const { debt: storedOverdueFutureA } = await createDebt(
        tenantA.businessId,
        tenantA.branchId,
        tenantA.warehouseId,
        { dueDate: tomorrow },
      );
      await prisma.customerDebt.update({
        where: { id: storedOverdueFutureA.id },
        data: { status: "OVERDUE" },
      });
      const { debt: overdueB } = await createDebt(tenantB.businessId, tenantB.branchId, tenantB.warehouseId, {
        dueDate: yesterday,
      });

      const create = await tenantA.agent.post("/api/v1/automation/rules").send({
        name: "Shared overdue evaluator",
        triggers: [{ type: "INVOICE_OVERDUE", config: {} }],
        actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
      });
      expect(create.status).toBe(201);
      const ruleId = create.body.data.id as string;

      const dryRun = await tenantA.agent.post(`/api/v1/automation/rules/${ruleId}/test`).send({});
      expect(dryRun.status).toBe(200);

      const evalMatches = await evaluator.findMatchingDebts(tenantA.businessId, {
        type: "INVOICE_OVERDUE",
        offsetDays: null,
      });

      const dryIds = (dryRun.body.data.triggers[0].matchedDebts as Array<{ id: string }>)
        .map((d) => d.id)
        .sort();
      const evalIds = evalMatches.map((d) => d.id).sort();

      expect(dryIds).toEqual(evalIds);
      expect(dryIds).toContain(overdueA.id);
      expect(dryIds).not.toContain(futureA.id);
      expect(dryIds).not.toContain(storedOverdueFutureA.id);
      expect(dryIds).not.toContain(overdueB.id);
      expect(evalMatches.every((d) => d.businessId === tenantA.businessId)).toBe(true);
    });

    it("returns the same LOW_STOCK match set as the shared evaluator and isolates tenants", async () => {
      const tenantA = await registerAndOnboard("AutoEvalAgreeStockA");
      const tenantB = await registerAndOnboard("AutoEvalAgreeStockB");
      const evaluator = createTriggerEvaluator({ prisma });

      async function createStock(businessId: string, warehouseId: string, quantity: number, threshold: number) {
        const suffix = uniqueSuffix();
        const product = await prisma.product.create({
          data: {
            businessId,
            name: `Stock ${suffix}`,
            sku: `SKU-${suffix}`,
            sellingPrice: 10,
            costPrice: 5,
            trackStock: true,
            lowStockThreshold: threshold,
          },
        });
        const level = await prisma.stockLevel.create({
          data: { businessId, warehouseId, productId: product.id, quantity },
        });
        return level;
      }

      const lowA = await createStock(tenantA.businessId, tenantA.warehouseId, 2, 10);
      const okA = await createStock(tenantA.businessId, tenantA.warehouseId, 40, 10);
      const lowB = await createStock(tenantB.businessId, tenantB.warehouseId, 1, 10);

      const create = await tenantA.agent.post("/api/v1/automation/rules").send({
        name: "Shared low-stock evaluator",
        triggers: [{ type: "LOW_STOCK", config: {} }],
        actions: [{ type: "CREATE_NOTIFICATION", order: 0, config: {} }],
      });
      expect(create.status).toBe(201);
      const ruleId = create.body.data.id as string;

      const dryRun = await tenantA.agent.post(`/api/v1/automation/rules/${ruleId}/test`).send({});
      expect(dryRun.status).toBe(200);

      const evalMatches = await evaluator.findLowStockMatches(tenantA.businessId);
      const dryIds = (dryRun.body.data.triggers[0].matchedStockLevels as Array<{ stockLevelId: string }>)
        .map((m) => m.stockLevelId)
        .sort();
      const evalIds = evalMatches.map((m) => m.stockLevelId).sort();

      expect(dryRun.body.data.triggers[0].matchedCount).toBe(evalMatches.length);
      expect(dryIds).toEqual(evalIds);
      expect(dryIds).toContain(lowA.id);
      expect(dryIds).not.toContain(okA.id);
      expect(dryIds).not.toContain(lowB.id);
      expect(evalMatches.every((m) => m.businessId === tenantA.businessId)).toBe(true);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
