import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const app = createApp();

function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
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

describe("tenant isolation (deep)", () => {
  describe("Warehouse isolation", () => {
    it("prevents Tenant B from listing Tenant A's warehouses", async () => {
      const tenantA = await registerAndOnboard("WhIsoA");
      const tenantB = await registerAndOnboard("WhIsoB");

      const listB = await tenantB.agent.get("/api/v1/warehouses");
      expect(listB.status).toBe(200);
      const idsB = (listB.body.data as Array<{ id: string }>).map((w) => w.id);
      expect(idsB).not.toContain(tenantA.warehouseId);
    });

    it("returns 404 when Tenant B attempts to PATCH Tenant A's warehouse", async () => {
      const tenantA = await registerAndOnboard("WhIsoPatchA");
      const tenantB = await registerAndOnboard("WhIsoPatchB");

      const leak = await tenantB.agent
        .patch(`/api/v1/warehouses/${tenantA.warehouseId}`)
        .send({ name: "Hacked Warehouse" });
      expect(leak.status).toBe(404);
      expect(leak.body.error.code).toBe("NOT_FOUND");

      const stillA = await tenantA.agent.get("/api/v1/warehouses");
      const target = (stillA.body.data as Array<{ id: string; name: string }>).find(
        (w) => w.id === tenantA.warehouseId,
      );
      expect(target?.name).toBe("Main warehouse");
    });
  });

  describe("User/Membership isolation", () => {
    it("prevents Tenant B from listing Tenant A's users", async () => {
      const tenantA = await registerAndOnboard("UserIsoA");
      const tenantB = await registerAndOnboard("UserIsoB");

      const listB = await tenantB.agent.get("/api/v1/users");
      expect(listB.status).toBe(200);
      const emailsB = (listB.body.data as Array<{ user: { email: string } }>).map(
        (m) => m.user.email,
      );
      expect(emailsB).not.toContain(tenantA.email);
    });

    it("returns 404 when Tenant B attempts to PATCH Tenant A's membership", async () => {
      const tenantA = await registerAndOnboard("UserIsoPatchA");
      const tenantB = await registerAndOnboard("UserIsoPatchB");

      const membersA = await tenantA.agent.get("/api/v1/users");
      expect(membersA.status).toBe(200);
      const membershipIdA = (membersA.body.data as Array<{ id: string }>)[0]?.id as string;
      expect(membershipIdA).toBeTruthy();

      const leak = await tenantB.agent
        .patch(`/api/v1/users/${membershipIdA}`)
        .send({ status: "DISABLED" });
      expect(leak.status).toBe(404);
      expect(leak.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when Tenant B attempts to DELETE Tenant A's membership", async () => {
      const tenantA = await registerAndOnboard("UserIsoDeleteA");
      const tenantB = await registerAndOnboard("UserIsoDeleteB");

      const membersA = await tenantA.agent.get("/api/v1/users");
      const membershipIdA = (membersA.body.data as Array<{ id: string }>)[0]?.id as string;

      const leak = await tenantB.agent.delete(`/api/v1/users/${membershipIdA}`);
      expect(leak.status).toBe(404);
      expect(leak.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Role isolation", () => {
    it("prevents Tenant B from listing Tenant A's custom roles", async () => {
      const tenantA = await registerAndOnboard("RoleIsoA");
      const tenantB = await registerAndOnboard("RoleIsoB");

      const createRole = await tenantA.agent.post("/api/v1/roles").send({
        name: "Custom Auditor",
        permissionKeys: ["reports.read"],
      });
      expect(createRole.status).toBe(201);
      const customRoleId = createRole.body.data.id as string;

      const rolesB = await tenantB.agent.get("/api/v1/roles");
      expect(rolesB.status).toBe(200);
      const idsB = (rolesB.body.data as Array<{ id: string }>).map((r) => r.id);
      expect(idsB).not.toContain(customRoleId);
    });

    it("returns 404 when Tenant B attempts to PATCH Tenant A's custom role", async () => {
      const tenantA = await registerAndOnboard("RoleIsoPatchA");
      const tenantB = await registerAndOnboard("RoleIsoPatchB");

      const createRole = await tenantA.agent.post("/api/v1/roles").send({
        name: "Custom Cashier Lead",
        permissionKeys: ["sales.read"],
      });
      expect(createRole.status).toBe(201);
      const customRoleId = createRole.body.data.id as string;

      const leak = await tenantB.agent
        .patch(`/api/v1/roles/${customRoleId}`)
        .send({ name: "Hacked Role" });
      expect(leak.status).toBe(404);
      expect(leak.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when Tenant B attempts to PATCH Tenant A's system role", async () => {
      const tenantA = await registerAndOnboard("RoleIsoSystemA");
      const tenantB = await registerAndOnboard("RoleIsoSystemB");

      const rolesA = await tenantA.agent.get("/api/v1/roles");
      const ownerRoleId = (rolesA.body.data as Array<{ id: string; slug: string }>).find(
        (r) => r.slug === "owner",
      )?.id as string;
      expect(ownerRoleId).toBeTruthy();

      const leak = await tenantB.agent
        .patch(`/api/v1/roles/${ownerRoleId}`)
        .send({ name: "Hacked Owner Role" });
      expect(leak.status).toBe(404);
    });
  });

  describe("Cross-business switching attack", () => {
    it("returns 403 when a user attempts to switch to a business they don't belong to", async () => {
      const tenantA = await registerAndOnboard("SwitchIsoA");
      const tenantB = await registerAndOnboard("SwitchIsoB");

      const attempt = await tenantB.agent
        .post("/api/v1/auth/switch-business")
        .send({ businessId: tenantA.businessId });
      expect(attempt.status).toBe(403);
      expect(attempt.body.error.code).toBe("FORBIDDEN");

      const me = await tenantB.agent.get("/api/v1/auth/me");
      expect(me.status).toBe(200);
      expect(me.body.data.currentMembership.businessId).toBe(tenantB.businessId);
    });

    it("returns 403 when switching to a non-existent business", async () => {
      const tenantB = await registerAndOnboard("SwitchIsoNonexistent");

      const attempt = await tenantB.agent
        .post("/api/v1/auth/switch-business")
        .send({ businessId: "does-not-exist" });
      expect(attempt.status).toBe(403);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
