import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PERMISSION_CATALOG, syncReferenceData } from "@daljir/database";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const app = createApp();
const password = "CorrectHorse-1";
const UNKNOWN_KEY = "zz.unknown.refdata";

function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

function grantKey(row: { roleId: string; permissionId: string }) {
  return `${row.roleId}:${row.permissionId}`;
}

describe("reference data sync", () => {
  it("upserts the permission catalog idempotently and never deletes rows or grants", async () => {
    await prisma.permission.upsert({
      where: { key: UNKNOWN_KEY },
      update: {},
      create: {
        key: UNKNOWN_KEY,
        family: "unknown",
        description: "Leftover key used to prove sync never deletes",
      },
    });

    const permissionsBefore = await prisma.permission.findMany({ select: { key: true } });
    const grantsBefore = await prisma.rolePermission.findMany({
      select: { roleId: true, permissionId: true },
    });
    const permissionCountBefore = permissionsBefore.length;
    const grantCountBefore = grantsBefore.length;
    const grantSetBefore = new Set(grantsBefore.map(grantKey));

    const first = await syncReferenceData(prisma);
    const second = await syncReferenceData(prisma);

    const permissionsAfter = await prisma.permission.findMany({ select: { key: true } });
    const grantsAfter = await prisma.rolePermission.findMany({
      select: { roleId: true, permissionId: true },
    });
    const keysAfter = new Set(permissionsAfter.map((row) => row.key));

    for (const item of PERMISSION_CATALOG) {
      expect(keysAfter.has(item.key)).toBe(true);
    }
    expect(keysAfter.has(UNKNOWN_KEY)).toBe(true);
    expect(first.unknownKeys).toContain(UNKNOWN_KEY);
    expect(second.unknownKeys).toContain(UNKNOWN_KEY);

    expect(first.permissionCount).toBeGreaterThanOrEqual(PERMISSION_CATALOG.length);
    expect(second.permissionCount).toBe(first.permissionCount);
    expect(second.rolePermissionCount).toBe(first.rolePermissionCount);
    expect(second.systemRoleGrantsAdded).toBe(0);
    expect(permissionsAfter.length).toBeGreaterThanOrEqual(permissionCountBefore);
    expect(grantsAfter.length).toBeGreaterThanOrEqual(grantCountBefore);

    const grantSetAfter = new Set(grantsAfter.map(grantKey));
    for (const key of grantSetBefore) {
      expect(grantSetAfter.has(key)).toBe(true);
    }
  });

  it("lets a freshly onboarded owner pass a permission-gated route after catalog sync", async () => {
    const before = await syncReferenceData(prisma);
    const email = uniqueEmail("refdata-owner");
    const agent = request.agent(app);

    const register = await agent.post("/api/v1/auth/register").send({
      fullName: "Refdata Owner",
      email,
      password,
    });
    expect(register.status).toBe(201);

    const onboard = await agent.post("/api/v1/businesses").send({
      name: "Refdata Trading",
      type: "RETAIL",
      locale: "en",
      branch: { name: "Main", code: `RF${Date.now().toString(36).slice(-4)}`.toUpperCase() },
      warehouse: { name: "Main warehouse", code: `WH${Date.now().toString(36).slice(-4)}`.toUpperCase() },
    });
    expect(onboard.status).toBe(201);

    const sessionPermissions = onboard.body.data.session.currentMembership.permissions as string[];
    expect(sessionPermissions).toEqual(expect.arrayContaining(PERMISSION_CATALOG.map((item) => item.key)));
    expect(sessionPermissions).toHaveLength(PERMISSION_CATALOG.length);

    const sales = await agent.get("/api/v1/sales");
    expect(sales.status).toBe(200);
    expect(sales.body.error).toBeNull();

    const branches = await agent.get("/api/v1/branches");
    expect(branches.status).toBe(200);

    const grants = await prisma.rolePermission.findMany({
      select: { roleId: true, permissionId: true },
    });
    const grantSet = new Set(grants.map(grantKey));
    const after = await syncReferenceData(prisma);

    expect(after.permissionCount).toBe(before.permissionCount);
    expect(after.systemRoleGrantsAdded).toBe(0);

    const grantsAfter = await prisma.rolePermission.findMany({
      select: { roleId: true, permissionId: true },
    });
    expect(grantsAfter.length).toBe(grants.length);
    for (const key of grantSet) {
      expect(grantsAfter.map(grantKey)).toContain(key);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
