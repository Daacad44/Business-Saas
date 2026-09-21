import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createProductFixture, registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

describe("Goods receipt (Purchases)", () => {
  it("increments stock exactly once per line, links movementId, and matches StockLevel to the ledger sum", async () => {
    const owner = await registerAndOnboard(app, "GrBasicA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "GR Supplier" });
    const supplierId = supplier.body.data.id as string;
    const productA = await createProductFixture({ businessId: owner.businessId });
    const productB = await createProductFixture({ businessId: owner.businessId });

    const receive = await owner.agent.post("/api/v1/purchases").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [
        { productId: productA.id, quantity: 10, unitCost: 4 },
        { productId: productB.id, quantity: 5, unitCost: 8 },
      ],
    });
    expect(receive.status).toBe(201);
    expect(receive.body.data.subtotal).toBe("80.00");
    expect(receive.body.data.totalAmount).toBe("80.00");
    expect(receive.body.data.amountDue).toBe("80.00");
    expect(receive.body.data.items).toHaveLength(2);
    for (const item of receive.body.data.items as Array<{ movementId: string | null }>) {
      expect(item.movementId).toBeTruthy();
    }

    for (const [product, expectedQty] of [
      [productA, "10.000"],
      [productB, "5.000"],
    ] as const) {
      const movements = await prisma.stockMovement.findMany({
        where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]?.type).toBe("PURCHASE_IN");

      const level = await prisma.stockLevel.findFirst({
        where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
      });
      expect(level?.quantity.toFixed(3)).toBe(expectedQty);
    }
  });

  it("updates the product's weighted-average cost price using Decimal arithmetic", async () => {
    const owner = await registerAndOnboard(app, "GrCostA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Cost Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId, costPrice: "0" });

    const first = await owner.agent.post("/api/v1/purchases").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 10, unitCost: 4 }],
    });
    expect(first.status).toBe(201);

    let refreshed = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(refreshed.costPrice.toFixed(2)).toBe("4.00");

    // Second receipt: 10 units @ 4 existing + 10 units @ 10 new => weighted avg (10*4 + 10*10)/20 = 7.00
    const second = await owner.agent.post("/api/v1/purchases").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 10, unitCost: 10 }],
    });
    expect(second.status).toBe(201);

    refreshed = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(refreshed.costPrice.toFixed(2)).toBe("7.00");
  });

  it("generates gap-free sequential purchase numbers per business", async () => {
    const owner = await registerAndOnboard(app, "GrSequenceA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Sequence Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const receipts = [];
    for (let i = 0; i < 3; i += 1) {
      const receive = await owner.agent.post("/api/v1/purchases").send({
        supplierId,
        warehouseId: owner.warehouseId,
        items: [{ productId: product.id, quantity: 1, unitCost: 1 }],
      });
      expect(receive.status).toBe(201);
      receipts.push(receive.body.data.purchaseNumber as string);
    }

    expect(new Set(receipts).size).toBe(3);
    expect(receipts).toEqual([...receipts].sort());
  });

  it("advances a linked purchase order from SENT to PARTIALLY_RECEIVED then RECEIVED", async () => {
    const owner = await registerAndOnboard(app, "GrPoLinkA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "PO Link Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const createOrder = await owner.agent.post("/api/v1/purchase-orders").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 20, unitCost: 3 }],
    });
    const orderId = createOrder.body.data.id as string;
    await owner.agent.post(`/api/v1/purchase-orders/${orderId}/approve`);

    const partial = await owner.agent.post("/api/v1/purchases").send({
      purchaseOrderId: orderId,
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 8, unitCost: 3 }],
    });
    expect(partial.status).toBe(201);

    let order = await owner.agent.get(`/api/v1/purchase-orders/${orderId}`);
    expect(order.body.data.status).toBe("PARTIALLY_RECEIVED");

    const final = await owner.agent.post("/api/v1/purchases").send({
      purchaseOrderId: orderId,
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 12, unitCost: 3 }],
    });
    expect(final.status).toBe(201);

    order = await owner.agent.get(`/api/v1/purchase-orders/${orderId}`);
    expect(order.body.data.status).toBe("RECEIVED");
  });

  it("rejects receiving against a DRAFT purchase order", async () => {
    const owner = await registerAndOnboard(app, "GrPoDraftReject");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Draft Reject Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const createOrder = await owner.agent.post("/api/v1/purchase-orders").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 5, unitCost: 3 }],
    });
    const orderId = createOrder.body.data.id as string;

    const receive = await owner.agent.post("/api/v1/purchases").send({
      purchaseOrderId: orderId,
      supplierId,
      warehouseId: owner.warehouseId,
      items: [{ productId: product.id, quantity: 5, unitCost: 3 }],
    });
    expect(receive.status).toBe(409);
  });

  describe("Cross-tenant foreign key attack", () => {
    it("rejects a purchase referencing another business's supplier, warehouse, and product with 404 and writes nothing", async () => {
      const tenantA = await registerAndOnboard(app, "GrCrossFkA");
      const tenantB = await registerAndOnboard(app, "GrCrossFkB");

      const supplierB = await tenantB.agent.post("/api/v1/suppliers").send({ name: "Tenant B Supplier" });
      const supplierBId = supplierB.body.data.id as string;
      const productB = await createProductFixture({ businessId: tenantB.businessId });

      const movementCountBefore = await prisma.stockMovement.count();
      const purchaseCountBefore = await prisma.purchase.count();

      // 1. Cross-tenant supplierId
      const attemptSupplier = await tenantA.agent.post("/api/v1/purchases").send({
        supplierId: supplierBId,
        warehouseId: tenantA.warehouseId,
        items: [{ productId: (await createProductFixture({ businessId: tenantA.businessId })).id, quantity: 1, unitCost: 1 }],
      });
      expect(attemptSupplier.status).toBe(404);

      const supplierA = await tenantA.agent.post("/api/v1/suppliers").send({ name: "Tenant A Supplier" });
      const supplierAId = supplierA.body.data.id as string;

      // 2. Cross-tenant warehouseId
      const attemptWarehouse = await tenantA.agent.post("/api/v1/purchases").send({
        supplierId: supplierAId,
        warehouseId: tenantB.warehouseId,
        items: [{ productId: (await createProductFixture({ businessId: tenantA.businessId })).id, quantity: 1, unitCost: 1 }],
      });
      expect(attemptWarehouse.status).toBe(404);

      // 3. Cross-tenant productId
      const attemptProduct = await tenantA.agent.post("/api/v1/purchases").send({
        supplierId: supplierAId,
        warehouseId: tenantA.warehouseId,
        items: [{ productId: productB.id, quantity: 1, unitCost: 1 }],
      });
      expect(attemptProduct.status).toBe(404);

      const movementCountAfter = await prisma.stockMovement.count();
      const purchaseCountAfter = await prisma.purchase.count();
      expect(movementCountAfter).toBe(movementCountBefore);
      expect(purchaseCountAfter).toBe(purchaseCountBefore);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
