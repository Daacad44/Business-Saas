import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, createProductFixture, registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

describe("Purchase orders lifecycle", () => {
  it("creates a purchase order WITHOUT touching stock", async () => {
    const owner = await registerAndOnboard(app, "PoLifecycleA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "PO Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const movementCountBefore = await prisma.stockMovement.count({ where: { businessId: owner.businessId } });
    const stockLevelBefore = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, productId: product.id, warehouseId: owner.warehouseId },
    });

    const create = await owner.agent.post("/api/v1/purchase-orders").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 10, unitCost: 5 }],
    });
    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe("DRAFT");
    expect(create.body.data.totalAmount).toBe("50.00");
    const orderId = create.body.data.id as string;

    const movementCountAfter = await prisma.stockMovement.count({ where: { businessId: owner.businessId } });
    const stockLevelAfter = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, productId: product.id, warehouseId: owner.warehouseId },
    });

    expect(movementCountAfter).toBe(movementCountBefore);
    expect(stockLevelAfter?.quantity ?? null).toEqual(stockLevelBefore?.quantity ?? null);

    const get = await owner.agent.get(`/api/v1/purchase-orders/${orderId}`);
    expect(get.status).toBe(200);
    expect(get.body.data.items).toHaveLength(1);
  });

  it("approves and cancels a purchase order via status transitions", async () => {
    const owner = await registerAndOnboard(app, "PoLifecycleTransition");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Transition Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const create = await owner.agent.post("/api/v1/purchase-orders").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 5, unitCost: 2 }],
    });
    const orderId = create.body.data.id as string;

    const approve = await owner.agent.post(`/api/v1/purchase-orders/${orderId}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe("SENT");

    const doubleApprove = await owner.agent.post(`/api/v1/purchase-orders/${orderId}/approve`);
    expect(doubleApprove.status).toBe(409);

    const cancel = await owner.agent.post(`/api/v1/purchase-orders/${orderId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe("CANCELLED");

    const doubleCancel = await owner.agent.post(`/api/v1/purchase-orders/${orderId}/cancel`);
    expect(doubleCancel.status).toBe(409);
  });

  it("lists and filters purchase orders by status and supplier", async () => {
    const owner = await registerAndOnboard(app, "PoLifecycleFilter");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Filter Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    await owner.agent.post("/api/v1/purchase-orders").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 1, unitCost: 1 }],
    });

    const list = await owner.agent.get("/api/v1/purchase-orders").query({ supplierId, status: "DRAFT" });
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    for (const order of list.body.data as Array<{ supplierId: string; status: string }>) {
      expect(order.supplierId).toBe(supplierId);
      expect(order.status).toBe("DRAFT");
    }
  });

  it("enforces the purchases.create permission on purchase order writes", async () => {
    const owner = await registerAndOnboard(app, "PoPermCreate");
    const limited = await createLimitedMember(app, owner, "PoPermCreateMember", ["purchases.read"]);
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Perm Supplier" });
    const product = await createProductFixture({ businessId: owner.businessId });

    const attempt = await limited.agent.post("/api/v1/purchase-orders").send({
      supplierId: supplier.body.data.id,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 1, unitCost: 1 }],
    });
    expect(attempt.status).toBe(403);
  });

  describe("Tenant isolation", () => {
    it("prevents Business B from reading Business A's purchase order", async () => {
      const tenantA = await registerAndOnboard(app, "PoIsoReadA");
      const tenantB = await registerAndOnboard(app, "PoIsoReadB");
      const supplier = await tenantA.agent.post("/api/v1/suppliers").send({ name: "Iso Supplier" });
      const product = await createProductFixture({ businessId: tenantA.businessId });

      const create = await tenantA.agent.post("/api/v1/purchase-orders").send({
        supplierId: supplier.body.data.id,
        warehouseId: tenantA.warehouseId,
        items: [{ productId: product.id, quantity: 1, unitCost: 1 }],
      });
      const orderId = create.body.data.id as string;

      const leak = await tenantB.agent.get(`/api/v1/purchase-orders/${orderId}`);
      expect(leak.status).toBe(404);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
