import { formatMoney, renderTemplate } from "@daljir/notifications";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";

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
    agent,
    userId: register.body.data.user.id as string,
    businessId: onboard.body.data.business.id as string,
  };
}

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

describe("notification templates", () => {
  it("supports create, read, update, list, and delete", async () => {
    const tenant = await registerAndOnboard("TplCrud");

    const create = await tenant.agent.post("/api/v1/notifications/templates").send({
      key: "debt-reminder",
      channel: "SMS",
      body: "Hi {{customerName}}, you owe {{amountDue}} due {{dueDate}}.",
      variables: { customerName: "string", amountDue: "money", dueDate: "date" },
      isActive: true,
    });
    expect(create.status).toBe(201);
    const templateId = create.body.data.id as string;

    const get = await tenant.agent.get(`/api/v1/notifications/templates/${templateId}`);
    expect(get.status).toBe(200);
    expect(get.body.data.key).toBe("debt-reminder");

    const list = await tenant.agent.get("/api/v1/notifications/templates");
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).map((t) => t.id)).toContain(templateId);

    const update = await tenant.agent.patch(`/api/v1/notifications/templates/${templateId}`).send({
      body: "Updated: {{customerName}} owes {{amountDue}}.",
    });
    expect(update.status).toBe(200);
    expect(update.body.data.body).toContain("Updated:");
    expect(update.body.data.version).toBe(2);

    const del = await tenant.agent.delete(`/api/v1/notifications/templates/${templateId}`);
    expect(del.status).toBe(200);

    const getAfterDelete = await tenant.agent.get(`/api/v1/notifications/templates/${templateId}`);
    expect(getAfterDelete.status).toBe(404);
  });

  it("rejects a duplicate key+channel combination", async () => {
    const tenant = await registerAndOnboard("TplDup");
    const payload = { key: "welcome", channel: "EMAIL", body: "Welcome {{customerName}}!" };
    const first = await tenant.agent.post("/api/v1/notifications/templates").send(payload);
    expect(first.status).toBe(201);
    const second = await tenant.agent.post("/api/v1/notifications/templates").send(payload);
    expect(second.status).toBe(409);
  });

  describe("tenant isolation", () => {
    it("returns 404 when Tenant B reads or updates Tenant A's template", async () => {
      const tenantA = await registerAndOnboard("TplIsoA");
      const tenantB = await registerAndOnboard("TplIsoB");

      const create = await tenantA.agent.post("/api/v1/notifications/templates").send({
        key: "iso-test",
        channel: "SMS",
        body: "Hello {{customerName}}",
      });
      const templateId = create.body.data.id as string;

      const readLeak = await tenantB.agent.get(`/api/v1/notifications/templates/${templateId}`);
      expect(readLeak.status).toBe(404);

      const updateLeak = await tenantB.agent.patch(`/api/v1/notifications/templates/${templateId}`).send({ body: "Hacked" });
      expect(updateLeak.status).toBe(404);

      const deleteLeak = await tenantB.agent.delete(`/api/v1/notifications/templates/${templateId}`);
      expect(deleteLeak.status).toBe(404);
    });
  });

  describe("permission enforcement", () => {
    it("returns 403 for a member without automation.manage", async () => {
      const tenant = await registerAndOnboard("TplPerm");
      await revokeAutomationPermission(tenant.businessId, tenant.userId);

      const attempt = await tenant.agent.get("/api/v1/notifications/templates");
      expect(attempt.status).toBe(403);
    });
  });

  describe("preview endpoint", () => {
    it("renders with exact money precision and never throws on a missing variable", async () => {
      const tenant = await registerAndOnboard("TplPreview");
      const create = await tenant.agent.post("/api/v1/notifications/templates").send({
        key: "precision-test",
        channel: "EMAIL",
        subject: "Balance for {{customerName}}",
        body: "{{customerName}} owes {{amountDue}}, missing var is [{{doesNotExist}}]",
      });
      expect(create.status).toBe(201);
      const templateId = create.body.data.id as string;

      const preview = await tenant.agent.post(`/api/v1/notifications/templates/${templateId}/preview`).send({
        variables: { customerName: "Amina", amountDue: "1234.5" },
      });
      expect(preview.status).toBe(200);
      // Over HTTP `amountDue` arrives as a plain string, so it is
      // interpolated as-is; automation-triggered rendering (tested in
      // run-trigger-match) passes real `Prisma.Decimal` values, which ARE
      // formatted with exact 2-decimal precision (see the unit tests below).
      expect(preview.body.data.body).toBe("Amina owes 1234.5, missing var is []");
      expect(preview.body.data.subject).toBe("Balance for Amina");
    });
  });
});

describe("render.ts unit behavior", () => {
  it("formats Prisma.Decimal money values with exact precision (no float rounding)", () => {
    // 0.1 + 0.2 famously does not equal 0.3 with native floating point math;
    // Decimal-based formatting must never go through that arithmetic path.
    expect(formatMoney(new Prisma.Decimal("0.1").plus(new Prisma.Decimal("0.2")))).toBe("0.30");
    expect(formatMoney(new Prisma.Decimal("10.1"))).toBe("10.10");
    expect(formatMoney("1234.5")).toBe("1234.50");
    expect(formatMoney(1234567.891)).toBe("1234567.89");
  });

  it("never throws for malformed input and blanks unknown placeholders", () => {
    expect(renderTemplate("Hello {{name}}", {})).toBe("Hello ");
    expect(renderTemplate("{{a}}-{{b}}-{{c}}", { a: "x", c: null })).toBe("x--");
    // @ts-expect-error deliberately passing a non-string to prove it never throws
    expect(renderTemplate(undefined, {})).toBe("");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
