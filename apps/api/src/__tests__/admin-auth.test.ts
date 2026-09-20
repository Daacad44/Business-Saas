import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";

const app = createApp();

function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

const password = "CorrectHorse-1";

describe("Platform Admin Authorization & Isolation", () => {
  it("rejects unauthenticated access to /api/v1/admin/overview", async () => {
    const res = await request(app).get("/api/v1/admin/overview");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects regular business owner from accessing platform admin", async () => {
    const email = uniqueEmail("business-owner");
    const agent = request.agent(app);

    // Register a normal user
    const register = await agent.post("/api/v1/auth/register").send({
      fullName: "Business Owner",
      email,
      password,
    });
    expect(register.status).toBe(201);

    // Onboard as owner of a business
    const onboard = await agent.post("/api/v1/businesses").send({
      name: "Owner Store",
      type: "RETAIL",
      branch: { name: "Branch 1", code: "B1" },
      warehouse: { name: "WH 1", code: "W1" },
    });
    expect(onboard.status).toBe(201);

    // Verify user is an owner of this business
    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.currentMembership.roleSlug).toBe("owner");
    expect(me.body.data.user.platformRole).toBe("USER");

    // Attempt to access platform admin endpoints
    const adminOverview = await agent.get("/api/v1/admin/overview");
    expect(adminOverview.status).toBe(403);
    expect(adminOverview.body.error.code).toBe("FORBIDDEN");
    expect(adminOverview.body.error.message).toContain("Platform administrator access required");

    const adminBusinesses = await agent.get("/api/v1/admin/businesses");
    expect(adminBusinesses.status).toBe(403);
  });

  it("permits verified platform super admin to access platform admin endpoints", async () => {
    const email = uniqueEmail("super-admin");
    const passwordHash = await hashPassword(password);

    // Create super admin directly with platformRole: SUPER_ADMIN
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
    const login = await agent.post("/api/v1/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.platformRole).toBe("SUPER_ADMIN");

    // Access overview
    const overview = await agent.get("/api/v1/admin/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.data).toHaveProperty("businessCount");
    expect(overview.body.data).toHaveProperty("userCount");
    expect(typeof overview.body.data.businessCount).toBe("number");

    // Access businesses list
    const businesses = await agent.get("/api/v1/admin/businesses");
    expect(businesses.status).toBe(200);
    expect(Array.isArray(businesses.body.data)).toBe(true);

    // Access users list
    const users = await agent.get("/api/v1/admin/users");
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body.data)).toBe(true);

    // Access system health
    const health = await agent.get("/api/v1/admin/system-health");
    expect(health.status).toBe(200);
    expect(health.body.data.status).toBe("healthy");
    expect(health.body.data.database.connected).toBe(true);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
