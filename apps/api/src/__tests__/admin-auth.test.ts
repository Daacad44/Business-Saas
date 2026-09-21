import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import {
  createBusinessOwnerAgent,
  createRegularUserAgent,
  createSuperAdminAgent,
  TEST_PASSWORD,
  uniqueEmail,
} from "./admin-test-helpers.js";

const app = createApp();

describe("Platform Admin Authorization & Isolation", () => {
  it("rejects unauthenticated access to /api/v1/admin/overview", async () => {
    const res = await request(app).get("/api/v1/admin/overview");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects regular business owner from accessing platform admin", async () => {
    const { agent } = await createBusinessOwnerAgent(app, "matrix-business-owner");

    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.currentMembership.roleSlug).toBe("owner");
    expect(me.body.data.user.platformRole).toBe("USER");

    const adminOverview = await agent.get("/api/v1/admin/overview");
    expect(adminOverview.status).toBe(403);
    expect(adminOverview.body.error.code).toBe("FORBIDDEN");
    expect(adminOverview.body.error.message).toContain("Platform administrator access required");

    const adminBusinesses = await agent.get("/api/v1/admin/businesses");
    expect(adminBusinesses.status).toBe(403);
  });

  it("permits verified platform super admin to access platform admin endpoints", async () => {
    const email = uniqueEmail("super-admin");
    const passwordHash = await hashPassword(TEST_PASSWORD);

    const adminUser = await prisma.user.create({
      data: {
        email,
        fullName: "Platform Super Admin",
        passwordHash,
        status: "ACTIVE",
        platformRole: "SUPER_ADMIN",
      },
    });

    const agent = request.agent(app);
    const login = await agent.post("/api/v1/auth/login").send({ email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.platformRole).toBe("SUPER_ADMIN");

    const overview = await agent.get("/api/v1/admin/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.data).toHaveProperty("businessCount");
    expect(overview.body.data).toHaveProperty("userCount");
    expect(typeof overview.body.data.businessCount).toBe("number");

    const businesses = await agent.get("/api/v1/admin/businesses");
    expect(businesses.status).toBe(200);
    expect(Array.isArray(businesses.body.data)).toBe(true);

    const users = await agent.get("/api/v1/admin/users");
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body.data)).toBe(true);

    const health = await agent.get("/api/v1/admin/system-health");
    expect(health.status).toBe(200);
    expect(["healthy", "degraded"]).toContain(health.body.data.status);
    expect(health.body.data.database.connected).toBe(true);

    await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => undefined);
  });
});

type EndpointCase = {
  name: string;
  method: "get" | "post" | "patch";
  path: (ctx: MatrixContext) => string;
  body?: (ctx: MatrixContext) => Record<string, unknown>;
};

type MatrixContext = {
  businessId: string;
  targetUserId: string;
  actingSuperAdminUserId: string;
  sessionId: string;
};

describe("Full authorization matrix across every platform admin endpoint", () => {
  const endpoints: EndpointCase[] = [
    { name: "GET /admin/overview", method: "get", path: () => "/api/v1/admin/overview" },
    { name: "GET /admin/businesses", method: "get", path: () => "/api/v1/admin/businesses" },
    { name: "GET /admin/businesses/:id", method: "get", path: (ctx) => `/api/v1/admin/businesses/${ctx.businessId}` },
    {
      name: "POST /admin/businesses/:id/suspend",
      method: "post",
      path: (ctx) => `/api/v1/admin/businesses/${ctx.businessId}/suspend`,
      body: () => ({}),
    },
    {
      name: "POST /admin/businesses/:id/reactivate",
      method: "post",
      path: (ctx) => `/api/v1/admin/businesses/${ctx.businessId}/reactivate`,
    },
    { name: "GET /admin/users", method: "get", path: () => "/api/v1/admin/users" },
    { name: "GET /admin/users/:id", method: "get", path: (ctx) => `/api/v1/admin/users/${ctx.targetUserId}` },
    {
      name: "PATCH /admin/users/:id/platform-role",
      method: "patch",
      path: (ctx) => `/api/v1/admin/users/${ctx.targetUserId}/platform-role`,
      body: () => ({ platformRole: "SUPER_ADMIN" }),
    },
    { name: "GET /admin/system-health", method: "get", path: () => "/api/v1/admin/system-health" },
    { name: "GET /admin/audit-logs", method: "get", path: () => "/api/v1/admin/audit-logs" },
    { name: "GET /admin/sessions", method: "get", path: () => "/api/v1/admin/sessions" },
    {
      name: "POST /admin/sessions/:id/revoke",
      method: "post",
      path: (ctx) => `/api/v1/admin/sessions/${ctx.sessionId}/revoke`,
    },
  ];

  it("asserts 401 unauthenticated, 403 normal user, 403 business owner, 200 super admin for every endpoint", async () => {
    const owner = await createBusinessOwnerAgent(app, "matrix-owner");
    const regular = await createRegularUserAgent(app);
    const superAdmin = await createSuperAdminAgent(app, "matrix-super-admin");

    // A second, disposable user/session for mutating endpoints to act on.
    const targetUser = await createRegularUserAgent(app);
    const targetSession = await prisma.session.findFirstOrThrow({ where: { userId: targetUser.userId } });

    const ctx: MatrixContext = {
      businessId: owner.businessId,
      targetUserId: targetUser.userId,
      actingSuperAdminUserId: superAdmin.userId,
      sessionId: targetSession.id,
    };

    for (const endpoint of endpoints) {
      const unauthenticated = await request(app)[endpoint.method](endpoint.path(ctx));
      expect(unauthenticated.status, `${endpoint.name} should reject unauthenticated`).toBe(401);
      expect(unauthenticated.body.error.code).toBe("UNAUTHORIZED");

      const asRegular = await regular.agent[endpoint.method](endpoint.path(ctx)).send(endpoint.body?.(ctx));
      expect(asRegular.status, `${endpoint.name} should reject a normal authenticated user`).toBe(403);
      expect(asRegular.body.error.code).toBe("FORBIDDEN");

      const asOwner = await owner.agent[endpoint.method](endpoint.path(ctx)).send(endpoint.body?.(ctx));
      expect(asOwner.status, `${endpoint.name} should reject a non-platform-admin business owner`).toBe(403);
      expect(asOwner.body.error.code).toBe("FORBIDDEN");
    }

    // Verify the 200 path per endpoint, using disposable targets so mutations don't interfere with each other.
    for (const endpoint of endpoints) {
      // Revoking the same session twice would 409; use a fresh session for that one case.
      let localCtx = ctx;
      if (endpoint.name === "POST /admin/sessions/:id/revoke") {
        const freshUser = await createRegularUserAgent(app);
        const freshSession = await prisma.session.findFirstOrThrow({ where: { userId: freshUser.userId } });
        localCtx = { ...ctx, sessionId: freshSession.id };
      }
      if (endpoint.name === "POST /admin/businesses/:id/suspend") {
        // Ensure the business starts active before suspending in this pass.
        await prisma.businessSettings.updateMany({
          where: { businessId: ctx.businessId },
          data: { extra: {} },
        });
      }
      if (endpoint.name === "POST /admin/businesses/:id/reactivate") {
        await prisma.businessSettings.updateMany({
          where: { businessId: ctx.businessId },
          data: { extra: { suspended: true } },
        });
      }
      if (endpoint.name === "PATCH /admin/users/:id/platform-role") {
        await prisma.user.update({ where: { id: ctx.targetUserId }, data: { platformRole: "USER" } });
      }

      const asSuperAdmin = await superAdmin.agent[endpoint.method](endpoint.path(localCtx)).send(
        endpoint.body?.(localCtx),
      );
      expect(asSuperAdmin.status, `${endpoint.name} should succeed for a super admin`).toBeLessThan(300);
      expect(asSuperAdmin.body.error).toBeNull();
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
