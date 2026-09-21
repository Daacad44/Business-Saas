import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { SignJWT } from "jose";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";

const app = createApp();

function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

const password = "CorrectHorse-1";

function extractCookie(setCookieHeaders: string[] | undefined, name: string) {
  const header = (setCookieHeaders ?? []).find((cookie) => cookie.startsWith(`${name}=`));
  if (!header) return undefined;
  return header.split(";")[0];
}

function cookieHeader(...cookies: Array<string | undefined>) {
  return cookies.filter(Boolean).join("; ");
}

describe("session and token security", () => {
  describe("revoked session", () => {
    it("rejects requests with the old access cookie after logout", async () => {
      const email = uniqueEmail("revoke-session");
      const register = await request(app).post("/api/v1/auth/register").send({
        fullName: "Session Revoke",
        email,
        password,
      });
      expect(register.status).toBe(201);

      const setCookies = register.headers["set-cookie"] as unknown as string[];
      const accessCookie = extractCookie(setCookies, "daljir_at");
      const refreshCookie = extractCookie(setCookies, "daljir_rt");
      expect(accessCookie).toBeTruthy();
      expect(refreshCookie).toBeTruthy();

      const meBefore = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", cookieHeader(accessCookie, refreshCookie));
      expect(meBefore.status).toBe(200);

      const logout = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", cookieHeader(accessCookie, refreshCookie))
        .send();
      expect(logout.status).toBe(200);

      const meAfter = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", cookieHeader(accessCookie, refreshCookie));
      expect(meAfter.status).toBe(401);
      expect(meAfter.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects refresh attempts using an already-revoked refresh token", async () => {
      const email = uniqueEmail("revoke-refresh");
      const register = await request(app).post("/api/v1/auth/register").send({
        fullName: "Refresh Revoke",
        email,
        password,
      });
      expect(register.status).toBe(201);

      const setCookies = register.headers["set-cookie"] as unknown as string[];
      const refreshCookie = extractCookie(setCookies, "daljir_rt");
      expect(refreshCookie).toBeTruthy();

      const logout = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", cookieHeader(refreshCookie))
        .send();
      expect(logout.status).toBe(200);

      const refreshAttempt = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookieHeader(refreshCookie))
        .send();
      expect(refreshAttempt.status).toBe(401);
    });
  });

  describe("tampered/forged tokens", () => {
    it("rejects an access token signed with the wrong secret", async () => {
      const email = uniqueEmail("wrong-secret");
      const register = await request(app).post("/api/v1/auth/register").send({
        fullName: "Wrong Secret",
        email,
        password,
      });
      expect(register.status).toBe(201);
      const userId = register.body.data.user.id as string;

      const setCookies = register.headers["set-cookie"] as unknown as string[];
      const refreshCookie = extractCookie(setCookies, "daljir_rt");

      const session = await prisma.session.findFirst({ where: { userId } });
      expect(session).toBeTruthy();

      const forgedSecret = new TextEncoder().encode("a-completely-different-signing-secret-value");
      const forgedToken = await new SignJWT({ sub: userId, sid: session!.id })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(forgedSecret);

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", cookieHeader(`daljir_at=${forgedToken}`, refreshCookie));
      expect(res.status).toBe(401);
    });

    it("rejects a corrupted/malformed access token payload", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", "daljir_at=not-a-valid-jwt-token-at-all");
      expect(res.status).toBe(401);
    });

    it("rejects an access token with a truncated signature", async () => {
      const email = uniqueEmail("truncated-sig");
      const register = await request(app).post("/api/v1/auth/register").send({
        fullName: "Truncated Signature",
        email,
        password,
      });
      expect(register.status).toBe(201);

      const setCookies = register.headers["set-cookie"] as unknown as string[];
      const accessCookie = extractCookie(setCookies, "daljir_at");
      const rawToken = accessCookie?.split("=")[1] as string;
      const corrupted = `${rawToken.slice(0, -4)}abcd`;

      const res = await request(app).get("/api/v1/auth/me").set("Cookie", `daljir_at=${corrupted}`);
      expect(res.status).toBe(401);
    });

    it("rejects an access token referencing a non-existent session", async () => {
      const email = uniqueEmail("ghost-session");
      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, fullName: "Ghost Session", passwordHash, status: "ACTIVE" },
      });

      const forgedToken = await new SignJWT({ sub: user.id, sid: "nonexistent-session-id" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET as string));

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", `daljir_at=${forgedToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe("Admin route rejection matrix", () => {
    const adminEndpoints = [
      "/api/v1/admin/overview",
      "/api/v1/admin/businesses",
      "/api/v1/admin/users",
      "/api/v1/admin/system-health",
      "/api/v1/admin/audit-logs",
    ];

    it("rejects unauthenticated requests on every admin endpoint with 401", async () => {
      for (const endpoint of adminEndpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHORIZED");
      }
    });

    it("rejects a non-admin Business Owner on every admin endpoint with 403", async () => {
      const email = uniqueEmail("owner-matrix");
      const agent = request.agent(app);
      const register = await agent.post("/api/v1/auth/register").send({
        fullName: "Owner Matrix",
        email,
        password,
      });
      expect(register.status).toBe(201);

      const onboard = await agent.post("/api/v1/businesses").send({
        name: "Owner Matrix Trading",
        type: "RETAIL",
        branch: { name: "HQ", code: "HQ1" },
        warehouse: { name: "HQ Warehouse", code: "WH1" },
      });
      expect(onboard.status).toBe(201);

      const me = await agent.get("/api/v1/auth/me");
      expect(me.body.data.currentMembership.roleSlug).toBe("owner");
      expect(me.body.data.user.platformRole).toBe("USER");

      for (const endpoint of adminEndpoints) {
        const res = await agent.get(endpoint);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
        expect(res.body.error.message).toContain("Platform administrator access required");
      }
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
