import request from "supertest";
import type { Express } from "express";
import { prisma } from "../lib/prisma.js";

export const password = "CorrectHorse-1";

export function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

export async function registerAndOnboard(app: Express, label: string) {
  const email = uniqueEmail(label);
  const agent = request.agent(app);
  const register = await agent.post("/api/v1/auth/register").send({
    fullName: label,
    email,
    password,
  });
  if (register.status !== 201) {
    throw new Error(`register failed: ${JSON.stringify(register.body)}`);
  }

  const onboard = await agent.post("/api/v1/businesses").send({
    name: `${label} Trading`,
    type: "RETAIL",
    locale: "en",
    branch: { name: "Main", code: "MAIN" },
    warehouse: { name: "Main warehouse", code: "WH1" },
  });
  if (onboard.status !== 201) {
    throw new Error(`onboard failed: ${JSON.stringify(onboard.body)}`);
  }

  return {
    agent,
    email,
    userId: register.body.data.user.id as string,
    businessId: onboard.body.data.business.id as string,
    branchId: onboard.body.data.branch.id as string,
    warehouseId: onboard.body.data.warehouse.id as string,
  };
}

/** Creates a second member of `owner`'s business restricted to `permissionKeys`. */
export async function createLimitedMember(
  app: Express,
  owner: { agent: ReturnType<typeof request.agent> },
  label: string,
  permissionKeys: string[],
) {
  const roleRes = await owner.agent.post("/api/v1/roles").send({
    name: `${label} Role ${Date.now()}`,
    permissionKeys,
  });
  if (roleRes.status !== 201) {
    throw new Error(`role create failed: ${JSON.stringify(roleRes.body)}`);
  }
  const roleId = roleRes.body.data.id as string;

  const email = uniqueEmail(label);
  const inviteRes = await owner.agent.post("/api/v1/users/invite").send({ email, roleId });
  if (inviteRes.status !== 201) {
    throw new Error(`invite failed: ${JSON.stringify(inviteRes.body)}`);
  }
  const token = inviteRes.body.data.token as string;

  const agent = request.agent(app);
  const registerRes = await agent.post("/api/v1/auth/register").send({
    fullName: label,
    email,
    password,
    invitationToken: token,
  });
  if (registerRes.status !== 201) {
    throw new Error(`member register failed: ${JSON.stringify(registerRes.body)}`);
  }

  return { agent, email };
}

let fixtureCounter = 0;

/** Creates a Product directly via Prisma (Inventory module is owned by a sibling agent). */
export async function createProductFixture(args: {
  businessId: string;
  name?: string;
  costPrice?: string;
  sellingPrice?: string;
}) {
  fixtureCounter += 1;
  const suffix = `${Date.now()}-${fixtureCounter}-${Math.random().toString(36).slice(2, 6)}`;
  return prisma.product.create({
    data: {
      businessId: args.businessId,
      name: args.name ?? `Test Product ${suffix}`,
      sku: `SKU-${suffix}`,
      barcode: `BC-${suffix}`,
      costPrice: args.costPrice ?? "0",
      sellingPrice: args.sellingPrice ?? "10.00",
      trackStock: true,
    },
  });
}

export async function getStockLevel(args: { businessId: string; warehouseId: string; productId: string }) {
  return prisma.stockLevel.findFirst({
    where: { businessId: args.businessId, warehouseId: args.warehouseId, productId: args.productId },
  });
}

export async function listMovements(args: { businessId: string; warehouseId: string; productId: string }) {
  return prisma.stockMovement.findMany({
    where: { businessId: args.businessId, warehouseId: args.warehouseId, productId: args.productId },
  });
}
