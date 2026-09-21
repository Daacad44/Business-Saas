import cookieParser from "cookie-parser";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { asyncHandler } from "../lib/async.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import {
  createBusinessOwnerAgent,
  createSuperAdminAgent,
} from "./admin-test-helpers.js";

const app = createApp();

/**
 * The real inventory/sales/customers/purchases/reports domain routers live outside
 * this agent's ownership boundary (apps/api/src/modules/{inventory,sales,customers,
 * purchases,reports}/**) and are not yet merged into this branch. Every one of those
 * routers, present and future, is fronted by the exact same `requireTenant` middleware
 * used by every existing tenant-scoped route in this codebase (branches, warehouses,
 * users, roles). This tiny app mounts that same, unmodified `requireTenant` in front of
 * representative reads/writes against the actual domain tables (Product, Sale, Customer,
 * CustomerDebt, Purchase) to prove the enforcement point in the shared middleware blocks
 * every domain once wired up — the invariant under test is middleware behavior, which is
 * domain-agnostic, not any particular module's business logic.
 */
function buildDomainTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser());

  testApp.get(
    "/t/inventory",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const items = await prisma.product.findMany({ where: { businessId: req.tenant!.businessId } });
      res.json({ data: items });
    }),
  );
  testApp.post(
    "/t/inventory",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const product = await prisma.product.create({
        data: {
          businessId: req.tenant!.businessId,
          name: `Enforcement Test Product ${Date.now()}`,
          sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sellingPrice: 10,
        },
      });
      res.status(201).json({ data: product });
    }),
  );

  testApp.get(
    "/t/sales",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const items = await prisma.sale.findMany({ where: { businessId: req.tenant!.businessId } });
      res.json({ data: items });
    }),
  );
  testApp.post(
    "/t/sales",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const { branchId, warehouseId } = req.body as { branchId: string; warehouseId: string };
      const sale = await prisma.sale.create({
        data: {
          businessId: req.tenant!.businessId,
          branchId,
          warehouseId,
          saleNumber: `S-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          subtotal: 10,
          totalAmount: 10,
        },
      });
      res.status(201).json({ data: sale });
    }),
  );

  testApp.get(
    "/t/customers",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const items = await prisma.customer.findMany({ where: { businessId: req.tenant!.businessId } });
      res.json({ data: items });
    }),
  );
  testApp.post(
    "/t/customers",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const customer = await prisma.customer.create({
        data: {
          businessId: req.tenant!.businessId,
          fullName: `Enforcement Test Customer ${Date.now()}`,
        },
      });
      res.status(201).json({ data: customer });
    }),
  );

  testApp.get(
    "/t/debts",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const items = await prisma.customerDebt.findMany({ where: { businessId: req.tenant!.businessId } });
      res.json({ data: items });
    }),
  );
  testApp.post(
    "/t/debts",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const { debtId } = req.body as { debtId: string };
      const debt = await prisma.customerDebt.update({
        where: { id: debtId },
        data: { remindersSent: { increment: 1 } },
      });
      res.json({ data: debt });
    }),
  );

  testApp.get(
    "/t/purchases",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const items = await prisma.purchase.findMany({ where: { businessId: req.tenant!.businessId } });
      res.json({ data: items });
    }),
  );
  testApp.post(
    "/t/purchases",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const { supplierId, warehouseId } = req.body as { supplierId: string; warehouseId: string };
      const purchase = await prisma.purchase.create({
        data: {
          businessId: req.tenant!.businessId,
          supplierId,
          warehouseId,
          purchaseNumber: `P-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          subtotal: 10,
          totalAmount: 10,
          amountDue: 10,
        },
      });
      res.status(201).json({ data: purchase });
    }),
  );

  // Reports is a read-only surface in this platform (no domain write endpoint exists),
  // so only a read is exercised for it, per the enforcement matrix below.
  testApp.get(
    "/t/reports",
    requireAuth,
    requireTenant,
    asyncHandler(async (req, res) => {
      const agg = await prisma.sale.aggregate({
        where: { businessId: req.tenant!.businessId },
        _sum: { totalAmount: true },
      });
      res.json({ data: agg });
    }),
  );

  testApp.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ data: null, error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ data: null, error: { code: "INTERNAL_ERROR", message: "Unexpected error" } });
  });

  return testApp;
}

const domainApp = buildDomainTestApp();

function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

function pairsFrom(res: request.Response): string[] {
  const setCookie = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  return setCookie.map((c) => c.split(";")[0] ?? "");
}

/**
 * Registers + onboards a business owner directly, capturing the auth cookies (issued on
 * register) and the business-scope cookie (issued on onboarding) so they can be forwarded
 * as a plain `Cookie` header onto requests against the separate `domainApp` test instance
 * above — `requireAuth`/`requireTenant` only read `req.cookies`, so this works identically
 * to a real browser regardless of which Express app instance receives the request.
 */
async function ownerCookies(label: string) {
  const email = uniqueEmail(label);
  const agent = request.agent(app);
  const register = await agent.post("/api/v1/auth/register").send({
    fullName: "Business Owner",
    email,
    password: "CorrectHorse-1",
  });
  expect(register.status).toBe(201);

  const onboard = await agent.post("/api/v1/businesses").send({
    name: `Owner Store ${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "RETAIL",
    branch: { name: "Branch 1", code: `B1-${Math.random().toString(36).slice(2, 6)}` },
    warehouse: { name: "WH 1", code: `W1-${Math.random().toString(36).slice(2, 6)}` },
  });
  expect(onboard.status).toBe(201);

  const cookieHeader = [...pairsFrom(register), ...pairsFrom(onboard)].join("; ");

  return {
    agent,
    email,
    userId: register.body.data.user.id as string,
    businessId: onboard.body.data.business.id as string,
    branchId: onboard.body.data.branch.id as string,
    warehouseId: onboard.body.data.warehouse.id as string,
    cookieHeader,
  };
}

describe("Business suspension enforcement matrix", () => {
  it("blocks reads and writes across every major domain with 403 BUSINESS_SUSPENDED while suspended, and restores them on reactivation", async () => {
    const owner = await ownerCookies("enforcement-target");
    const superAdmin = await createSuperAdminAgent(app, "enforcement-admin");

    const supplier = await prisma.supplier.create({
      data: { businessId: owner.businessId, name: "Enforcement Test Supplier" },
    });
    const customer = await prisma.customer.create({
      data: { businessId: owner.businessId, fullName: "Enforcement Test Debtor" },
    });
    const sale = await prisma.sale.create({
      data: {
        businessId: owner.businessId,
        branchId: owner.branchId,
        warehouseId: owner.warehouseId,
        customerId: customer.id,
        saleNumber: `S-ENF-${Date.now()}`,
        subtotal: 10,
        totalAmount: 10,
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        businessId: owner.businessId,
        saleId: sale.id,
        customerId: customer.id,
        invoiceNumber: `INV-ENF-${Date.now()}`,
        subtotal: 10,
        totalAmount: 10,
        amountDue: 10,
      },
    });
    const debt = await prisma.customerDebt.create({
      data: {
        businessId: owner.businessId,
        customerId: customer.id,
        invoiceId: invoice.id,
        principalAmount: 10,
        outstandingAmount: 10,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const domainRequests: Array<{ domain: string; method: "get" | "post"; path: string; body?: object }> = [
      { domain: "inventory:read", method: "get", path: "/t/inventory" },
      { domain: "inventory:write", method: "post", path: "/t/inventory" },
      { domain: "sales:read", method: "get", path: "/t/sales" },
      {
        domain: "sales:write",
        method: "post",
        path: "/t/sales",
        body: { branchId: owner.branchId, warehouseId: owner.warehouseId },
      },
      { domain: "customers:read", method: "get", path: "/t/customers" },
      { domain: "customers:write", method: "post", path: "/t/customers" },
      { domain: "debts:read", method: "get", path: "/t/debts" },
      { domain: "debts:write", method: "post", path: "/t/debts", body: { debtId: debt.id } },
      { domain: "purchases:read", method: "get", path: "/t/purchases" },
      {
        domain: "purchases:write",
        method: "post",
        path: "/t/purchases",
        body: { supplierId: supplier.id, warehouseId: owner.warehouseId },
      },
      { domain: "reports:read", method: "get", path: "/t/reports" },
    ];

    // Sanity check: every representative request succeeds while the business is ACTIVE.
    for (const domainRequest of domainRequests) {
      const res = await request(domainApp)
        [domainRequest.method](domainRequest.path)
        .set("Cookie", owner.cookieHeader)
        .send(domainRequest.body ?? {});
      expect([200, 201]).toContain(res.status);
    }

    const suspendRes = await superAdmin.agent
      .post(`/api/v1/admin/businesses/${owner.businessId}/suspend`)
      .send({ reason: "Enforcement matrix test" });
    expect(suspendRes.status).toBe(200);

    for (const domainRequest of domainRequests) {
      const res = await request(domainApp)
        [domainRequest.method](domainRequest.path)
        .set("Cookie", owner.cookieHeader)
        .send(domainRequest.body ?? {});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("BUSINESS_SUSPENDED");
    }

    const reactivateRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/reactivate`);
    expect(reactivateRes.status).toBe(200);

    for (const domainRequest of domainRequests) {
      const res = await request(domainApp)
        [domainRequest.method](domainRequest.path)
        .set("Cookie", owner.cookieHeader)
        .send(domainRequest.body ?? {});
      expect([200, 201]).toContain(res.status);
    }
  });

  it("does not affect a second, unrelated business while the first is suspended", async () => {
    const businessA = await ownerCookies("cross-tenant-a");
    const businessB = await ownerCookies("cross-tenant-b");
    const superAdmin = await createSuperAdminAgent(app, "cross-tenant-admin");

    const suspendA = await superAdmin.agent.post(`/api/v1/admin/businesses/${businessA.businessId}/suspend`);
    expect(suspendA.status).toBe(200);

    const blockedA = await request(domainApp).get("/t/inventory").set("Cookie", businessA.cookieHeader);
    expect(blockedA.status).toBe(403);
    expect(blockedA.body.error.code).toBe("BUSINESS_SUSPENDED");

    const okB = await request(domainApp).get("/t/inventory").set("Cookie", businessB.cookieHeader);
    expect(okB.status).toBe(200);

    const meB = await businessB.agent.get("/api/v1/auth/me");
    expect(meB.status).toBe(200);
    expect(meB.body.data.currentMembership.businessStatus).toBe("ACTIVE");

    await superAdmin.agent.post(`/api/v1/admin/businesses/${businessA.businessId}/reactivate`);
  });

  it("prevents a member from switching into a suspended business", async () => {
    const owner = await createBusinessOwnerAgent(app, "switch-target");
    const superAdmin = await createSuperAdminAgent(app, "switch-admin");

    const suspendRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/suspend`);
    expect(suspendRes.status).toBe(200);

    const switchRes = await owner.agent
      .post("/api/v1/auth/switch-business")
      .send({ businessId: owner.businessId });
    expect(switchRes.status).toBe(403);
    expect(switchRes.body.error.code).toBe("BUSINESS_SUSPENDED");

    await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/reactivate`);
  });

  it("still allows login for a user whose only business is suspended, and represents the suspended state in the session payload", async () => {
    const owner = await createBusinessOwnerAgent(app, "login-suspended-target");
    const superAdmin = await createSuperAdminAgent(app, "login-suspended-admin");

    const suspendRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/suspend`);
    expect(suspendRes.status).toBe(200);

    await owner.agent.post("/api/v1/auth/logout").send();
    const login = await owner.agent
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: "CorrectHorse-1" });
    expect(login.status).toBe(200);
    expect(login.body.data.currentMembership.businessId).toBe(owner.businessId);
    expect(login.body.data.currentMembership.businessStatus).toBe("SUSPENDED");
    expect(
      (login.body.data.memberships as Array<{ businessId: string; businessStatus: string }>).find(
        (m) => m.businessId === owner.businessId,
      )?.businessStatus,
    ).toBe("SUSPENDED");

    const me = await owner.agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.currentMembership.businessStatus).toBe("SUSPENDED");

    await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/reactivate`);
  });

  it("still allows a platform SUPER_ADMIN to read a suspended business via /admin/businesses/:id", async () => {
    const owner = await createBusinessOwnerAgent(app, "admin-read-target");
    const superAdmin = await createSuperAdminAgent(app, "admin-read-admin");

    const suspendRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/suspend`);
    expect(suspendRes.status).toBe(200);

    const detail = await superAdmin.agent.get(`/api/v1/admin/businesses/${owner.businessId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe("SUSPENDED");
    expect(detail.body.data.id).toBe(owner.businessId);

    await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/reactivate`);
  });

  it("blocks the production createApp tenant routes (branches and warehouses) with 403 BUSINESS_SUSPENDED and leaves another tenant unaffected", async () => {
    const ownerA = await createBusinessOwnerAgent(app, "real-app-a");
    const ownerB = await createBusinessOwnerAgent(app, "real-app-b");
    const superAdmin = await createSuperAdminAgent(app, "real-app-admin");

    expect((await ownerA.agent.get("/api/v1/branches")).status).toBe(200);
    expect((await ownerA.agent.get("/api/v1/warehouses")).status).toBe(200);
    expect((await ownerB.agent.get("/api/v1/branches")).status).toBe(200);

    const suspendRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${ownerA.businessId}/suspend`);
    expect(suspendRes.status).toBe(200);

    const blockedRead = await ownerA.agent.get("/api/v1/branches");
    expect(blockedRead.status).toBe(403);
    expect(blockedRead.body.error.code).toBe("BUSINESS_SUSPENDED");

    const blockedWrite = await ownerA.agent.post("/api/v1/branches").send({
      name: "Should Be Blocked",
      code: `BLK-${Math.random().toString(36).slice(2, 6)}`,
    });
    expect(blockedWrite.status).toBe(403);
    expect(blockedWrite.body.error.code).toBe("BUSINESS_SUSPENDED");

    const blockedWarehouses = await ownerA.agent.get("/api/v1/warehouses");
    expect(blockedWarehouses.status).toBe(403);
    expect(blockedWarehouses.body.error.code).toBe("BUSINESS_SUSPENDED");

    const okB = await ownerB.agent.get("/api/v1/branches");
    expect(okB.status).toBe(200);
    expect(okB.body.error).toBeNull();

    const adminDetail = await superAdmin.agent.get(`/api/v1/admin/businesses/${ownerA.businessId}`);
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.data.status).toBe("SUSPENDED");

    const reactivateRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${ownerA.businessId}/reactivate`);
    expect(reactivateRes.status).toBe(200);

    const restored = await ownerA.agent.get("/api/v1/branches");
    expect(restored.status).toBe(200);
    expect(restored.body.error).toBeNull();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
