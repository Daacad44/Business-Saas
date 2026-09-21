import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createRegularUserAgent, createSuperAdminAgent } from "./admin-test-helpers.js";

const app = createApp();

describe("Session listing and revocation", () => {
  it("lists sessions without leaking refresh token hashes", async () => {
    const superAdmin = await createSuperAdminAgent(app, "sessions-list");
    await createRegularUserAgent(app);

    const res = await superAdmin.agent.get("/api/v1/admin/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const session of res.body.data as Array<Record<string, unknown>>) {
      expect(session).not.toHaveProperty("refreshTokenHash");
    }
  });

  it("revoking a session actually invalidates it, is audit-logged, and rejects a subsequent request", async () => {
    const superAdmin = await createSuperAdminAgent(app, "sessions-revoke");
    const target = await createRegularUserAgent(app);

    // The target's session is still valid before revocation.
    const beforeMe = await target.agent.get("/api/v1/auth/me");
    expect(beforeMe.status).toBe(200);

    const session = await prisma.session.findFirstOrThrow({
      where: { userId: target.userId, revokedAt: null },
    });

    const revoke = await superAdmin.agent.post(`/api/v1/admin/sessions/${session.id}/revoke`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.ok).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Session", entityId: session.id, action: "platform.session.revoke" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(superAdmin.userId);

    const persisted = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(persisted.revokedAt).not.toBeNull();

    // The same session cookie is now rejected on the next authenticated request.
    const afterMe = await target.agent.get("/api/v1/auth/me");
    expect(afterMe.status).toBe(401);

    // Revoking an already-revoked session is a conflict, not a silent success.
    const doubleRevoke = await superAdmin.agent.post(`/api/v1/admin/sessions/${session.id}/revoke`);
    expect(doubleRevoke.status).toBe(409);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
