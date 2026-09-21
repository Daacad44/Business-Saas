import type { Express } from "express";
import request from "supertest";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";

export const TEST_PASSWORD = "CorrectHorse-1";

export function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

/** A fresh authenticated agent with no business membership and no platform role. */
export async function createRegularUserAgent(app: Express) {
  const email = uniqueEmail("regular-user");
  const agent = request.agent(app);
  const register = await agent.post("/api/v1/auth/register").send({
    fullName: "Regular User",
    email,
    password: TEST_PASSWORD,
  });
  if (register.status !== 201) {
    throw new Error(`Failed to register regular user: ${JSON.stringify(register.body)}`);
  }
  const me = await agent.get("/api/v1/auth/me");
  const userId = me.body.data.user.id as string;
  return { agent, email, userId };
}

/** An authenticated agent who owns a business (business-level RBAC "owner"), not a platform admin. */
export async function createBusinessOwnerAgent(app: Express, label = "business-owner") {
  const email = uniqueEmail(label);
  const agent = request.agent(app);
  const register = await agent.post("/api/v1/auth/register").send({
    fullName: "Business Owner",
    email,
    password: TEST_PASSWORD,
  });
  if (register.status !== 201) {
    throw new Error(`Failed to register owner: ${JSON.stringify(register.body)}`);
  }

  const onboard = await agent.post("/api/v1/businesses").send({
    name: `Owner Store ${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "RETAIL",
    branch: { name: "Branch 1", code: `B1-${Math.random().toString(36).slice(2, 6)}` },
    warehouse: { name: "WH 1", code: `W1-${Math.random().toString(36).slice(2, 6)}` },
  });
  if (onboard.status !== 201) {
    throw new Error(`Failed to onboard business: ${JSON.stringify(onboard.body)}`);
  }

  const me = await agent.get("/api/v1/auth/me");
  const userId = me.body.data.user.id as string;
  const businessId = onboard.body.data.business.id as string;
  const branchId = onboard.body.data.branch.id as string;
  const warehouseId = onboard.body.data.warehouse.id as string;
  return { agent, email, userId, businessId, branchId, warehouseId };
}

/** An authenticated agent whose user record has platformRole SUPER_ADMIN. */
export async function createSuperAdminAgent(app: Express, label = "super-admin") {
  const email = uniqueEmail(label);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.create({
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
  if (login.status !== 200) {
    throw new Error(`Failed to log in super admin: ${JSON.stringify(login.body)}`);
  }
  return { agent, email, userId: user.id };
}
