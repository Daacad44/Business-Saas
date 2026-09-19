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
  return { agent, email, businessId: onboard.body.data.business.id as string };
}

describe("auth and tenant isolation", () => {
  it("rejects unauthenticated business access", async () => {
    const res = await request(app).get("/api/v1/businesses/current");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("registers, logs in, and returns the current user", async () => {
    const email = uniqueEmail("login");
    const agent = request.agent(app);
    const register = await agent.post("/api/v1/auth/register").send({
      fullName: "Amina Farah",
      email,
      password,
    });
    expect(register.status).toBe(201);
    expect(register.body.data.user.email).toBe(email);

    await agent.post("/api/v1/auth/logout").send();
    const login = await agent.post("/api/v1/auth/login").send({ email, password });
    expect(login.status).toBe(200);

    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
  });

  it("keeps branch data isolated between businesses", async () => {
    const tenantA = await registerAndOnboard("TenantA");
    const tenantB = await registerAndOnboard("TenantB");

    const branchesA = await tenantA.agent.get("/api/v1/branches");
    const branchesB = await tenantB.agent.get("/api/v1/branches");
    expect(branchesA.status).toBe(200);
    expect(branchesB.status).toBe(200);

    const idA = branchesA.body.data[0].id as string;
    const leak = await tenantB.agent.patch(`/api/v1/branches/${idA}`).send({ name: "Hacked" });
    expect(leak.status).toBe(404);

    const stillA = await tenantA.agent.get("/api/v1/branches");
    expect(stillA.body.data[0].name).toBe("Main");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
