import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createRegularUserAgent, createSuperAdminAgent } from "./admin-test-helpers.js";

const app = createApp();

describe("Platform role grant/revoke and self-demotion guard", () => {
  it("grants and revokes SUPER_ADMIN, both audit-logged", async () => {
    const superAdmin = await createSuperAdminAgent(app, "grantor");
    const target = await createRegularUserAgent(app);

    const grant = await superAdmin.agent
      .patch(`/api/v1/admin/users/${target.userId}/platform-role`)
      .send({ platformRole: "SUPER_ADMIN" });
    expect(grant.status).toBe(200);
    expect(grant.body.data.platformRole).toBe("SUPER_ADMIN");

    const grantAudit = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: target.userId, action: "platform.user.role.grant" },
    });
    expect(grantAudit).not.toBeNull();
    expect(grantAudit?.userId).toBe(superAdmin.userId);

    const revoke = await superAdmin.agent
      .patch(`/api/v1/admin/users/${target.userId}/platform-role`)
      .send({ platformRole: "USER" });
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.platformRole).toBe("USER");

    const revokeAudit = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: target.userId, action: "platform.user.role.revoke" },
    });
    expect(revokeAudit).not.toBeNull();
    expect(revokeAudit?.userId).toBe(superAdmin.userId);
  });

  it("blocks a super admin from revoking their own SUPER_ADMIN role", async () => {
    const superAdmin = await createSuperAdminAgent(app, "self-demote");

    const selfDemote = await superAdmin.agent
      .patch(`/api/v1/admin/users/${superAdmin.userId}/platform-role`)
      .send({ platformRole: "USER" });

    expect(selfDemote.status).toBe(400);
    expect(selfDemote.body.error.message).toContain("cannot revoke your own");

    const stillAdmin = await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.userId } });
    expect(stillAdmin.platformRole).toBe("SUPER_ADMIN");
  });

  it("allows a super admin to re-affirm their own SUPER_ADMIN role without error being a lockout risk", async () => {
    const superAdmin = await createSuperAdminAgent(app, "self-reaffirm");
    const res = await superAdmin.agent
      .patch(`/api/v1/admin/users/${superAdmin.userId}/platform-role`)
      .send({ platformRole: "SUPER_ADMIN" });
    // Already SUPER_ADMIN -> treated as a conflict (no-op), never a lockout.
    expect(res.status).toBe(409);
  });

  it("exposes a user detail view including memberships but no password hash", async () => {
    const superAdmin = await createSuperAdminAgent(app, "detail-admin");
    const target = await createRegularUserAgent(app);

    const detail = await superAdmin.agent.get(`/api/v1/admin/users/${target.userId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toHaveProperty("memberships");
    expect(detail.body.data).not.toHaveProperty("passwordHash");
  });

  it("returns 404 for a non-existent user", async () => {
    const superAdmin = await createSuperAdminAgent(app, "user-404");
    const res = await superAdmin.agent.get("/api/v1/admin/users/does-not-exist");
    expect(res.status).toBe(404);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
