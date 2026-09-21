import type { DebtStatus } from "@prisma/client";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../lib/prisma.js";

export const password = "CorrectHorse-1";

export function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

export async function registerAndOnboard(app: Express, label: string, overrides: { timezone?: string } = {}) {
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
    ...(overrides.timezone ? { timezone: overrides.timezone } : {}),
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

/** Creates a Sale + Invoice + CustomerDebt directly via Prisma (Sales module is owned by a sibling agent). */
export async function createDebtFixture(args: {
  businessId: string;
  branchId: string;
  warehouseId: string;
  customerId: string;
  principal: string;
  dueDate?: Date;
  status?: DebtStatus;
  outstandingAmount?: string;
  amountPaid?: string;
}) {
  fixtureCounter += 1;
  const suffix = `${Date.now()}-${fixtureCounter}`;
  const dueDate = args.dueDate ?? new Date();
  const outstandingAmount = args.outstandingAmount ?? args.principal;
  const amountPaid = args.amountPaid ?? "0";

  const sale = await prisma.sale.create({
    data: {
      businessId: args.businessId,
      branchId: args.branchId,
      warehouseId: args.warehouseId,
      customerId: args.customerId,
      saleNumber: `S-${suffix}`,
      type: "CREDIT",
      status: "COMPLETED",
      subtotal: args.principal,
      totalAmount: args.principal,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      businessId: args.businessId,
      saleId: sale.id,
      customerId: args.customerId,
      invoiceNumber: `INV-${suffix}`,
      status: "ISSUED",
      subtotal: args.principal,
      totalAmount: args.principal,
      amountDue: args.principal,
      dueDate,
    },
  });

  const debt = await prisma.customerDebt.create({
    data: {
      businessId: args.businessId,
      customerId: args.customerId,
      invoiceId: invoice.id,
      principalAmount: args.principal,
      amountPaid,
      outstandingAmount,
      dueDate,
      status: args.status ?? "PENDING",
    },
  });

  await prisma.customer.update({
    where: { id: args.customerId },
    data: { currentBalance: { increment: outstandingAmount } },
  });

  return { sale, invoice, debt };
}
