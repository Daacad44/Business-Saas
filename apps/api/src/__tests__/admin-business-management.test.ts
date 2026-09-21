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
    purchases,
    auditLogs,
  ] = await Promise.all([
    prisma.branch.count({ where: { businessId } }),
    prisma.warehouse.count({ where: { businessId } }),
    prisma.membership.count({ where: { businessId } }),
    prisma.product.count({ where: { businessId } }),
    prisma.customer.count({ where: { businessId } }),
    prisma.sale.count({ where: { businessId } }),
    prisma.purchase.count({ where: { businessId } }),
    prisma.auditLog.count({ where: { businessId } }),
  ]);
  return { branches, warehouses, memberships, products, customers, sales, purchases, auditLogs };
}

describe("Business suspend/reactivate", () => {
  it("suspends a business, writes an AuditLog naming the acting admin, and never mutates tenant domain rows", async () => {
    const owner = await createBusinessOwnerAgent(app, "suspend-target");
    const superAdmin = await createSuperAdminAgent(app, "suspend-admin");

    const before = await countAllTenantRows(owner.businessId);

    const suspendRes = await superAdmin.agent
      .post(`/api/v1/admin/businesses/${owner.businessId}/suspend`)
      .send({ reason: "Non-payment" });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe("SUSPENDED");

    const detail = await superAdmin.agent.get(`/api/v1/admin/businesses/${owner.businessId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe("SUSPENDED");
    expect(detail.body.data.suspendedReason).toBe("Non-payment");

    const auditRow = await prisma.auditLog.findFirst({
      where: { businessId: owner.businessId, action: "platform.business.suspend" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.userId).toBe(superAdmin.userId);

    const afterSuspend = await countAllTenantRows(owner.businessId);
    expect(afterSuspend.branches).toBe(before.branches);
    expect(afterSuspend.warehouses).toBe(before.warehouses);
    expect(afterSuspend.memberships).toBe(before.memberships);
    expect(afterSuspend.products).toBe(before.products);
    expect(afterSuspend.customers).toBe(before.customers);
    expect(afterSuspend.sales).toBe(before.sales);
    expect(afterSuspend.purchases).toBe(before.purchases);

    // Suspending again should be rejected (idempotent guard), not silently duplicate.
    const doubleSuspend = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/suspend`);
    expect(doubleSuspend.status).toBe(409);

    const reactivateRes = await superAdmin.agent.post(`/api/v1/admin/businesses/${owner.businessId}/reactivate`);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.status).toBe("ACTIVE");

    const reactivateAudit = await prisma.auditLog.findFirst({
      where: { businessId: owner.businessId, action: "platform.business.reactivate" },
      orderBy: { createdAt: "desc" },
    });
    expect(reactivateAudit).not.toBeNull();
    expect(reactivateAudit?.userId).toBe(superAdmin.userId);

    const afterReactivate = await countAllTenantRows(owner.businessId);
    expect(afterReactivate.branches).toBe(before.branches);
    expect(afterReactivate.warehouses).toBe(before.warehouses);
    expect(afterReactivate.memberships).toBe(before.memberships);
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
