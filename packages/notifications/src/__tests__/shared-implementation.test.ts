import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createNotificationsService } from "../service.js";
import type { NotificationsLogger } from "../logger.js";
import type { NotificationChannelDriver } from "../drivers/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

function uniqueSuffix(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function silentLogger(): NotificationsLogger {
  return { info: () => undefined, warn: () => undefined, error: () => undefined };
}

function alwaysSucceedsDriver(): NotificationChannelDriver {
  return {
    channel: "SMS",
    provider: "test-fake",
    async send() {
      return { status: "SENT" as const, provider: "test-fake", providerMessageId: "shared-fake-1" };
    },
  };
}

describe("static deduplication proof: both apps depend on this package, not on a local copy", () => {
  function readJson(relPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relPath), "utf8"));
  }

  it("apps/api declares @daljir/notifications as a dependency and imports it (no local dispatch/render/drivers copy)", () => {
    const pkg = readJson("apps/api/package.json");
    expect((pkg.dependencies as Record<string, string>)["@daljir/notifications"]).toBeDefined();

    expect(fs.existsSync(path.join(repoRoot, "apps/api/src/modules/notifications/dispatch.service.ts"))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, "apps/api/src/modules/notifications/render.ts"))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, "apps/api/src/modules/notifications/drivers"))).toBe(false);

    const service = fs.readFileSync(path.join(repoRoot, "apps/api/src/modules/notifications/service.ts"), "utf8");
    expect(service).toContain('from "@daljir/notifications"');
  });

  it("apps/worker declares @daljir/notifications as a dependency and imports it (no local dispatch/render/drivers copy)", () => {
    const pkg = readJson("apps/worker/package.json");
    expect((pkg.dependencies as Record<string, string>)["@daljir/notifications"]).toBeDefined();

    expect(fs.existsSync(path.join(repoRoot, "apps/worker/src/notifications"))).toBe(false);

    const service = fs.readFileSync(path.join(repoRoot, "apps/worker/src/lib/notifications.ts"), "utf8");
    expect(service).toContain('from "@daljir/notifications"');
  });
});

describe("runtime proof: one dispatch implementation produces identical rows for two independently-configured callers", () => {
  const prisma = new PrismaClient();

  async function createTestBusiness(label: string) {
    const suffix = uniqueSuffix();
    return prisma.business.create({
      data: {
        name: `${label} ${suffix}`,
        slug: `${label.toLowerCase()}-${suffix}`,
        type: "RETAIL",
      },
    });
  }

  it("an 'api-style' service instance and a 'worker-style' service instance both created via createNotificationsService produce structurally identical Notification + NotificationLog rows", async () => {
    // Two independently-constructed configs, mirroring how apps/api and
    // apps/worker each wire the SAME package with their own env/logger —
    // this is the single canonical dispatch code path both apps share.
    const apiStyleService = createNotificationsService({
      prisma,
      logger: silentLogger(),
      drivers: {},
      maxRetries: 3,
      retryBaseMs: 200,
    });
    const workerStyleService = createNotificationsService({
      prisma,
      logger: silentLogger(),
      drivers: {},
      maxRetries: 3,
      retryBaseMs: 2000,
    });

    const businessA = await createTestBusiness("SharedImplA");
    const businessB = await createTestBusiness("SharedImplB");

    const resultA = await apiStyleService.dispatchNotification({
      businessId: businessA.id,
      channel: "SMS",
      to: "+252611000010",
      content: "Shared implementation check",
      driver: alwaysSucceedsDriver(),
      maxAttempts: 1,
    });
    const resultB = await workerStyleService.dispatchNotification({
      businessId: businessB.id,
      channel: "SMS",
      to: "+252611000011",
      content: "Shared implementation check",
      driver: alwaysSucceedsDriver(),
      maxAttempts: 1,
    });

    const [notificationA, notificationB] = await Promise.all([
      prisma.notification.findUnique({ where: { id: resultA.notificationId } }),
      prisma.notification.findUnique({ where: { id: resultB.notificationId } }),
    ]);
    const [logsA, logsB] = await Promise.all([
      prisma.notificationLog.findMany({ where: { notificationId: resultA.notificationId }, orderBy: { createdAt: "asc" } }),
      prisma.notificationLog.findMany({ where: { notificationId: resultB.notificationId }, orderBy: { createdAt: "asc" } }),
    ]);

    expect(notificationA?.status).toBe(notificationB?.status);
    expect(notificationA?.channel).toBe(notificationB?.channel);
    expect(logsA.map((l) => l.status)).toEqual(logsB.map((l) => l.status));
    expect(logsA).toHaveLength(2); // initial QUEUED + one SENT attempt
    expect(logsB).toHaveLength(2);
    expect(resultA.status).toBe("SENT");
    expect(resultB.status).toBe("SENT");
    expect(resultA.provider).toBe(resultB.provider);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
