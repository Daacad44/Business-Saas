import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createBusinessOwnerAgent, createSuperAdminAgent } from "./admin-test-helpers.js";

const app = createApp();

async function countAllTenantRows(businessId: string) {
  const [
    branches,
    warehouses,
    memberships,
    products,
    customers,
    sales,
    invoices,
    debts,
    stockMovements,
    purchases,
    auditLogs,
  ] = await Promise.all([
    prisma.branch.count({ where: { businessId } }),
    prisma.warehouse.count({ where: { businessId } }),
    prisma.membership.count({ where: { businessId } }),
    prisma.product.count({ where: { businessId } }),
    prisma.customer.count({ where: { businessId } }),
    prisma.sale.count({ where: { businessId } }),
    prisma.invoice.count({ where: { businessId } }),
    prisma.customerDebt.count({ where: { businessId } }),
    prisma.stockMovement.count({ where: { businessId } }),
    prisma.purchase.count({ where: { businessId } }),
    prisma.auditLog.count({ where: { businessId } }),
  ]);
  return {
    branches,
    warehouses,
    memberships,
    products,
    customers,
    sales,
    invoices,
    debts,
    stockMovements,
    purchases,
    auditLogs,
  };
}

async function seedDomainRows(businessId: string, branchId: string, warehouseId: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const product = await prisma.product.create({
    data: {
      businessId,
      name: "Suspension Integrity Product",
      sku: `SKU-${suffix}`,
      sellingPrice: 25,
    },
  });
  const customer = await prisma.customer.create({
    data: { businessId, fullName: "Suspension Integrity Customer" },
  });
  const sale = await prisma.sale.create({
    data: {
      businessId,
      branchId,
      warehouseId,
      customerId: customer.id,
      saleNumber: `S-${suffix}`,
      subtotal: 25,
      totalAmount: 25,
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      businessId,
      saleId: sale.id,
      customerId: customer.id,
      invoiceNumber: `INV-${suffix}`,
      subtotal: 25,
      totalAmount: 25,
      amountDue: 25,
    },
  });
  await prisma.customerDebt.create({
    data: {
      businessId,
      customerId: customer.id,
      invoiceId: invoice.id,
      principalAmount: 25,
      outstandingAmount: 25,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.stockMovement.create({
    data: {
      businessId,
      warehouseId,
      productId: product.id,
      type: "OPENING_BALANCE",
      quantity: 4,
    },
  });
}

describe("Business suspend/reactivate", () => {
  it("suspends a business, writes an AuditLog naming the acting admin, and never mutates tenant domain rows", async () => {
    const owner = await createBusinessOwnerAgent(app, "suspend-target");
    const superAdmin = await createSuperAdminAgent(app, "suspend-admin");

    await seedDomainRows(owner.businessId, owner.branchId, owner.warehouseId);
    const before = await countAllTenantRows(owner.businessId);
    expect(before.products).toBeGreaterThan(0);
    expect(before.sales).toBeGreaterThan(0);
    expect(before.invoices).toBeGreaterThan(0);
    expect(before.debts).toBeGreaterThan(0);
    expect(before.stockMovements).toBeGreaterThan(0);

    const suspendRes = await superAdmin.agent
      .post(`/api/v1/admin/businesses/${owner.businessId}/suspend`)
      .send({ reason: "Non-payment" });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe("SUSPENDED");

    const detail = await superAdmin.agent.get(`/api/v1/admin/businesses/${owner.businessId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe("SUSPENDED");
    expect(detail.body.data.suspendedReason).toBe("Non-payment");

    const suspendAudits = await prisma.auditLog.findMany({
      where: { businessId: owner.businessId, action: "platform.business.suspend" },
    });
    expect(suspendAudits).toHaveLength(1);
    expect(suspendAudits[0]?.userId).toBe(superAdmin.userId);

    const afterSuspend = await countAllTenantRows(owner.businessId);
    expect(afterSuspend.branches).toBe(before.branches);
    expect(afterSuspend.warehouses).toBe(before.warehouses);
    expect(afterSuspend.memberships).toBe(before.memberships);
    expect(afterSuspend.products).toBe(before.products);
    expect(afterSuspend.customers).toBe(before.customers);
    expect(afterSuspend.sales).toBe(before.sales);
    expect(afterSuspend.invoices).toBe(before.invoices);
    expect(afterSuspend.debts).toBe(before.debts);
    expect(afterSuspend.stockMovements).toBe(before.stockMovements);
    expect(afterSuspend.purchases).toBe(before.purchases);
    // The only new row is the platform audit log for the suspend itself.
    expect(afterSuspend.auditLogs).toBe(before.auditLogs + 1);

    // Suspending again should be rejected (idempotent guard), not silently duplicate.
    const doubleSuspend = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/suspend`);
    expect(doubleSuspend.status).toBe(409);
    expect(doubleSuspend.body.error.code).toBe("CONFLICT");
    expect(
      await prisma.auditLog.count({
        where: { businessId: owner.businessId, action: "platform.business.suspend" },
      }),
    ).toBe(1);

    const reactivateRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/reactivate`);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.status).toBe("ACTIVE");

    const reactivateAudits = await prisma.auditLog.findMany({
      where: { businessId: owner.businessId, action: "platform.business.reactivate" },
    });
    expect(reactivateAudits).toHaveLength(1);
    expect(reactivateAudits[0]?.userId).toBe(superAdmin.userId);

    const doubleReactivate = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/reactivate`);
    expect(doubleReactivate.status).toBe(409);
    expect(doubleReactivate.body.error.code).toBe("CONFLICT");
    expect(
      await prisma.auditLog.count({
        where: { businessId: owner.businessId, action: "platform.business.reactivate" },
      }),
    ).toBe(1);

    const afterReactivate = await countAllTenantRows(owner.businessId);
    expect(afterReactivate.branches).toBe(before.branches);
    expect(afterReactivate.warehouses).toBe(before.warehouses);
    expect(afterReactivate.memberships).toBe(before.memberships);
    expect(afterReactivate.products).toBe(before.products);
    expect(afterReactivate.customers).toBe(before.customers);
    expect(afterReactivate.sales).toBe(before.sales);
    expect(afterReactivate.invoices).toBe(before.invoices);
    expect(afterReactivate.debts).toBe(before.debts);
    expect(afterReactivate.stockMovements).toBe(before.stockMovements);
    expect(afterReactivate.purchases).toBe(before.purchases);
  });

  it("returns 404 for a non-existent business", async () => {
    const superAdmin = await createSuperAdminAgent(app, "suspend-404");
    const res = await superAdmin.agent.post("/api/v1/admin/businesses/does-not-exist/suspend");
    expect(res.status).toBe(404);
  });

  it("lists businesses with pagination metadata and supports search/status filters", async () => {
    const owner = await createBusinessOwnerAgent(app, "list-target");
    const superAdmin = await createSuperAdminAgent(app, "list-admin");

    const list = await superAdmin.agent.get("/api/v1/admin/businesses").query({ pageSize: 5, page: 1 });
    expect(list.status).toBe(200);
    expect(list.body.meta).toHaveProperty("total");
    expect(list.body.meta).toHaveProperty("totalPages");
    expect(list.body.data.length).toBeLessThanOrEqual(5);

    const bySearch = await superAdmin.agent.get("/api/v1/admin/businesses").query({ search: owner.businessId });
    // Search matches by name/slug, not id, so this should just not error and return valid shape.
    expect(bySearch.status).toBe(200);
    expect(Array.isArray(bySearch.body.data)).toBe(true);

    const suspendedOnly = await superAdmin.agent.get("/api/v1/admin/businesses").query({ status: "SUSPENDED" });
    expect(suspendedOnly.status).toBe(200);
    for (const item of suspendedOnly.body.data as Array<{ status: string }>) {
      expect(item.status).toBe("SUSPENDED");
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
