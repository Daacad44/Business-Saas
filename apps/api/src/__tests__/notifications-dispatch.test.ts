import type { NotificationChannelDriver } from "@daljir/notifications";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { dispatchNotification } from "../modules/notifications/service.js";

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

function alwaysSucceedsDriver(): NotificationChannelDriver {
  return {
    channel: "SMS",
    provider: "test-fake",
    async send() {
      return { status: "SENT", provider: "test-fake", providerMessageId: "fake-123" };
    },
  };
}

function alwaysFailsDriver(): NotificationChannelDriver {
  return {
    channel: "SMS",
    provider: "test-fake-failing",
    async send() {
      return { status: "FAILED", provider: "test-fake-failing", errorMessage: "Simulated provider outage" };
    },
  };
}

describe("notification dispatch logging", () => {
  it("always writes a Notification + NotificationLog row, even on success", async () => {
    const tenant = await registerAndOnboard("DispatchLogOk");

    const result = await dispatchNotification({
      businessId: tenant.businessId,
      channel: "SMS",
      to: "+252611000001",
      content: "Test message",
      driver: alwaysSucceedsDriver(),
      maxAttempts: 1,
    });

    expect(result.status).toBe("SENT");

    const notification = await prisma.notification.findUnique({ where: { id: result.notificationId } });
    expect(notification).not.toBeNull();
    expect(notification?.status).toBe("SENT");

    const logs = await prisma.notificationLog.findMany({ where: { notificationId: result.notificationId } });
    expect(logs.length).toBeGreaterThanOrEqual(2); // initial QUEUED log + at least one attempt log
    expect(logs.some((log) => log.status === "SENT")).toBe(true);

    const smsMessage = await prisma.sMSMessage.findFirst({ where: { notificationId: result.notificationId } });
    expect(smsMessage).not.toBeNull();
    expect(smsMessage?.status).toBe("SENT");
    expect(smsMessage?.providerMessageId).toBe("fake-123");
  });

  it("records a FAILED status (not a silent swallow) when the provider fails on every attempt", async () => {
    const tenant = await registerAndOnboard("DispatchLogFail");

    const result = await dispatchNotification({
      businessId: tenant.businessId,
      channel: "SMS",
      to: "+252611000002",
      content: "Test message",
      driver: alwaysFailsDriver(),
      maxAttempts: 2,
      retryBaseMs: 5,
    });

    expect(result.status).toBe("FAILED");
    expect(result.attempts).toBe(2);

    const notification = await prisma.notification.findUnique({ where: { id: result.notificationId } });
    expect(notification?.status).toBe("FAILED");

    const logs = await prisma.notificationLog.findMany({
      where: { notificationId: result.notificationId },
      orderBy: { createdAt: "asc" },
    });
    // 1 initial QUEUED log + 2 FAILED attempt logs — every attempt is logged.
    expect(logs).toHaveLength(3);
    expect(logs.filter((log) => log.status === "FAILED")).toHaveLength(2);
    expect(logs.every((log) => log.errorMessage !== "Simulated provider outage" || log.status === "FAILED")).toBe(true);

    const smsMessage = await prisma.sMSMessage.findFirst({ where: { notificationId: result.notificationId } });
    expect(smsMessage?.status).toBe("FAILED");
    expect(smsMessage?.errorMessage).toBe("Simulated provider outage");
  });

  it("never creates a Notification without a matching NotificationLog", async () => {
    const tenant = await registerAndOnboard("DispatchLogInvariant");

    await dispatchNotification({
      businessId: tenant.businessId,
      channel: "SMS",
      to: "+252611000003",
      content: "Invariant check",
      driver: alwaysSucceedsDriver(),
      maxAttempts: 1,
    });

    const notifications = await prisma.notification.findMany({ where: { businessId: tenant.businessId } });
    for (const notification of notifications) {
      const logCount = await prisma.notificationLog.count({ where: { notificationId: notification.id } });
      expect(logCount).toBeGreaterThan(0);
    }
  });
});

describe("notification history + send-test endpoint", () => {
  it("exposes notifications and logs via the tenant-scoped history endpoints", async () => {
    const tenant = await registerAndOnboard("NotifHistory");

    const template = await tenant.agent.post("/api/v1/notifications/templates").send({
      key: "history-test",
      channel: "SMS",
      body: "Hi {{customerName}}",
    });
    expect(template.status).toBe(201);

    const sendTest = await tenant.agent.post("/api/v1/notifications/send-test").send({
      templateId: template.body.data.id,
      to: "+252611000004",
      variables: { customerName: "Fatima" },
    });
    expect(sendTest.status).toBe(201);
    const notificationId = sendTest.body.data.notificationId as string;

    const list = await tenant.agent.get("/api/v1/notifications");
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).map((n) => n.id)).toContain(notificationId);

    const detail = await tenant.agent.get(`/api/v1/notifications/${notificationId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.logs.length).toBeGreaterThan(0);

    const logs = await tenant.agent.get(`/api/v1/notifications/${notificationId}/logs`);
    expect(logs.status).toBe(200);
    expect(logs.body.data.length).toBeGreaterThan(0);
  });

  describe("tenant isolation", () => {
    it("returns 404 when Tenant B reads Tenant A's notification", async () => {
      const tenantA = await registerAndOnboard("NotifIsoA");
      const tenantB = await registerAndOnboard("NotifIsoB");

      const result = await dispatchNotification({
        businessId: tenantA.businessId,
        channel: "SMS",
        to: "+252611000005",
        content: "A-only notification",
        driver: alwaysSucceedsDriver(),
        maxAttempts: 1,
      });

      const leak = await tenantB.agent.get(`/api/v1/notifications/${result.notificationId}`);
      expect(leak.status).toBe(404);

      const logsLeak = await tenantB.agent.get(`/api/v1/notifications/${result.notificationId}/logs`);
      expect(logsLeak.status).toBe(404);

      const ok = await tenantA.agent.get(`/api/v1/notifications/${result.notificationId}`);
      expect(ok.status).toBe(200);
    });
  });

  describe("permission enforcement", () => {
    it("returns 403 for a member without automation.manage", async () => {
      const tenant = await registerAndOnboard("NotifPerm");
      const role = await prisma.role.create({
        data: {
          businessId: tenant.businessId,
          name: `No Automation ${uniqueSuffix()}`,
          slug: `no-automation-${uniqueSuffix()}`,
          isSystem: false,
        },
      });
      await prisma.membership.updateMany({ where: { businessId: tenant.businessId, userId: tenant.userId }, data: { roleId: role.id } });

      const attempt = await tenant.agent.get("/api/v1/notifications");
      expect(attempt.status).toBe(403);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
