import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createBusinessOwnerAgent, createSuperAdminAgent } from "./admin-test-helpers.js";

const app = createApp();

describe("Input validation guards against DoS-shaped requests", () => {
  it("rejects an oversized page size for businesses", async () => {
    const superAdmin = await createSuperAdminAgent(app, "validation-page-size");
    const res = await superAdmin.agent.get("/api/v1/admin/businesses").query({ pageSize: 999999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an oversized page size for users", async () => {
    const superAdmin = await createSuperAdminAgent(app, "validation-users-page-size");
    const res = await superAdmin.agent.get("/api/v1/admin/users").query({ pageSize: 5000 });
    expect(res.status).toBe(400);
  });

  it("rejects an oversized page size for audit logs", async () => {
    const superAdmin = await createSuperAdminAgent(app, "validation-audit-page-size");
    const res = await superAdmin.agent.get("/api/v1/admin/audit-logs").query({ pageSize: 10000 });
    expect(res.status).toBe(400);
  });

  it("rejects an inverted date range for audit log filters", async () => {
    const superAdmin = await createSuperAdminAgent(app, "validation-date-range");
    const res = await superAdmin.agent.get("/api/v1/admin/audit-logs").query({
      dateFrom: "2030-01-01",
      dateTo: "2020-01-01",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an audit log date range spanning more than the allowed window", async () => {
    const superAdmin = await createSuperAdminAgent(app, "validation-date-span");
    const res = await superAdmin.agent.get("/api/v1/admin/audit-logs").query({
      dateFrom: "2000-01-01",
      dateTo: "2030-01-01",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid platform role value on grant/revoke", async () => {
    const superAdmin = await createSuperAdminAgent(app, "validation-role-enum");
    const res = await superAdmin.agent
      .patch(`/api/v1/admin/users/${superAdmin.userId}/platform-role`)
      .send({ platformRole: "GOD_MODE" });
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range signup window on overview", async () => {
    const superAdmin = await createSuperAdminAgent(app, "validation-overview-days");
    const res = await superAdmin.agent.get("/api/v1/admin/overview").query({ signupDays: 5000 });
    expect(res.status).toBe(400);
  });
});

describe("Data minimisation: admin responses never leak tenant transactional data or customer PII", () => {
  it("business list/detail responses expose only aggregate metadata, no customer records", async () => {
    const owner = await createBusinessOwnerAgent(app, "minimisation-target");
    const superAdmin = await createSuperAdminAgent(app, "minimisation-admin");

    const list = await superAdmin.agent.get("/api/v1/admin/businesses");
    expect(list.status).toBe(200);
    for (const item of list.body.data as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty("customers");
      expect(item).not.toHaveProperty("sales");
      expect(item).not.toHaveProperty("invoices");
      expect(item).not.toHaveProperty("products");
    }

    const detail = await superAdmin.agent.get(`/api/v1/admin/businesses/${owner.businessId}`);
    expect(detail.status).toBe(200);
    const body = JSON.stringify(detail.body.data);
    // Aggregate counts are fine; raw customer/sale record arrays are not.
    expect(detail.body.data.counts).toBeDefined();
    expect(typeof detail.body.data.counts.customers).toBe("number");
    expect(detail.body.data).not.toHaveProperty("customerList");
    expect(detail.body.data).not.toHaveProperty("saleList");
    expect(body).not.toMatch(/"phone":"\+?\d{7,}/);
  });

  it("audit log entries never include a request body or secret fields", async () => {
    const superAdmin = await createSuperAdminAgent(app, "minimisation-audit");
    const logs = await superAdmin.agent.get("/api/v1/admin/audit-logs").query({ pageSize: 20 });
    expect(logs.status).toBe(200);
    for (const log of logs.body.data as Array<Record<string, unknown>>) {
      expect(log).not.toHaveProperty("passwordHash");
      expect(log).not.toHaveProperty("refreshTokenHash");
    }
  });

  it("system health never leaks the database or redis connection string", async () => {
    const superAdmin = await createSuperAdminAgent(app, "minimisation-health");
    const res = await superAdmin.agent.get("/api/v1/admin/system-health");
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("postgresql://");
    expect(body).not.toContain("redis://");
    expect(body).not.toContain(process.env.DATABASE_URL ?? "__unset__");
  });

  it("user list/detail responses never include a password hash", async () => {
    const superAdmin = await createSuperAdminAgent(app, "minimisation-users");
    const list = await superAdmin.agent.get("/api/v1/admin/users");
    expect(list.status).toBe(200);
    for (const item of list.body.data as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty("passwordHash");
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
