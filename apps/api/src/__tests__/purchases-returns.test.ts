import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, createProductFixture, registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

async function receivePurchase(
  owner: Awaited<ReturnType<typeof registerAndOnboard>>,
  supplierId: string,
  productId: string,
  quantity: number,
  unitCost: number,
) {
  const receive = await owner.agent.post("/api/v1/purchases").send({
    supplierId,
    warehouseId: owner.warehouseId,
    items: [{ productId, quantity, unitCost }],
  });
  expect(receive.status).toBe(201);
  return receive.body.data as {
    id: string;
    warehouseId: string;
    items: Array<{ id: string; productId: string; quantity: string }>;
  };
}

describe("Purchase returns", () => {
  it("removes stock via a new RETURN_OUT movement and conserves quantities", async () => {
    const owner = await registerAndOnboard(app, "ReturnBasicA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Return Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const purchase = await receivePurchase(owner, supplierId, product.id, 10, 5); // 50.00 total
    const purchaseItemId = purchase.items[0]!.id;

    const movementCountBefore = await prisma.stockMovement.count({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });

    const doReturn = await owner.agent.post(`/api/v1/purchases/${purchase.id}/returns`).send({
      reason: "Damaged goods",
      items: [{ purchaseItemId, quantity: 3 }],
    });
    expect(doReturn.status).toBe(201);
    expect(doReturn.body.data.totalAmount).toBe("15.00");
    expect(doReturn.body.data.items[0].movementId).toBeTruthy();

    const movements = await prisma.stockMovement.findMany({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
      orderBy: { createdAt: "asc" },
    });
    expect(movements).toHaveLength(movementCountBefore + 1);
    expect(movements.at(-1)?.type).toBe("RETURN_OUT");
    expect(movements.at(-1)?.quantity.toFixed(3)).toBe("-3.000");

    const level = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(level?.quantity.toFixed(3)).toBe("7.000");

    const purchaseAfter = await owner.agent.get(`/api/v1/purchases/${purchase.id}`);
    expect(purchaseAfter.body.data.totalAmount).toBe("35.00");
    expect(purchaseAfter.body.data.amountDue).toBe("35.00");
  });

  it("rejects an over-return that exceeds the received quantity across multiple returns", async () => {
    const owner = await registerAndOnboard(app, "ReturnOverA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Over Return Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const purchase = await receivePurchase(owner, supplierId, product.id, 5, 2);
    const purchaseItemId = purchase.items[0]!.id;

    const firstReturn = await owner.agent.post(`/api/v1/purchases/${purchase.id}/returns`).send({
      items: [{ purchaseItemId, quantity: 3 }],
    });
    expect(firstReturn.status).toBe(201);

    // Only 2 remain returnable (5 received - 3 already returned); requesting 3 more must fail.
    const secondReturn = await owner.agent.post(`/api/v1/purchases/${purchase.id}/returns`).send({
      items: [{ purchaseItemId, quantity: 3 }],
    });
    expect(secondReturn.status).toBe(409);

    const level = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(level?.quantity.toFixed(3)).toBe("2.000");
  });

  it("rejects a return when there is insufficient stock left to remove (already sold out)", async () => {
    const owner = await registerAndOnboard(app, "ReturnInsufficientA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Insufficient Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const purchase = await receivePurchase(owner, supplierId, product.id, 5, 2);
    const purchaseItemId = purchase.items[0]!.id;

    // Simulate the stock having been sold out via a sibling module's stock movement.
    await prisma.stockMovement.create({
      data: {
        businessId: owner.businessId,
        warehouseId: owner.warehouseId,
        productId: product.id,
        type: "SALE_OUT",
        quantity: "-5",
        referenceType: "sale",
        referenceId: "test-sale",
      },
    });
    await prisma.stockLevel.updateMany({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
      data: { quantity: "0" },
    });

    const attempt = await owner.agent.post(`/api/v1/purchases/${purchase.id}/returns`).send({
      items: [{ purchaseItemId, quantity: 2 }],
    });
    expect(attempt.status).toBe(409);
  });

  it("rejects a return referencing a purchaseItemId belonging to another purchase", async () => {
    const owner = await registerAndOnboard(app, "ReturnCrossPurchaseA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Cross Purchase Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const purchaseA = await receivePurchase(owner, supplierId, product.id, 5, 2);
    const purchaseB = await receivePurchase(owner, supplierId, product.id, 5, 2);

    const attempt = await owner.agent.post(`/api/v1/purchases/${purchaseB.id}/returns`).send({
      items: [{ purchaseItemId: purchaseA.items[0]!.id, quantity: 1 }],
    });
    expect(attempt.status).toBe(404);
  });

  it("enforces the purchases.create permission for creating a return", async () => {
    const owner = await registerAndOnboard(app, "ReturnPermA");
    const limited = await createLimitedMember(app, owner, "ReturnPermMember", ["purchases.read"]);
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Perm Return Supplier" });
    const product = await createProductFixture({ businessId: owner.businessId });
    const purchase = await receivePurchase(owner, supplier.body.data.id, product.id, 5, 2);

    const attempt = await limited.agent.post(`/api/v1/purchases/${purchase.id}/returns`).send({
      items: [{ purchaseItemId: purchase.items[0]!.id, quantity: 1 }],
    });
    expect(attempt.status).toBe(403);
  });

  describe("Tenant isolation", () => {
    it("prevents Business B from reading Business A's purchase return", async () => {
      const tenantA = await registerAndOnboard(app, "ReturnIsoReadA");
      const tenantB = await registerAndOnboard(app, "ReturnIsoReadB");
      const supplier = await tenantA.agent.post("/api/v1/suppliers").send({ name: "Iso Return Supplier" });
      const product = await createProductFixture({ businessId: tenantA.businessId });
      const purchase = await receivePurchase(tenantA, supplier.body.data.id, product.id, 5, 2);

      const doReturn = await tenantA.agent.post(`/api/v1/purchases/${purchase.id}/returns`).send({
        items: [{ purchaseItemId: purchase.items[0]!.id, quantity: 1 }],
      });
      const returnId = doReturn.body.data.id as string;

      const leak = await tenantB.agent.get(`/api/v1/purchases/returns/${returnId}`);
      expect(leak.status).toBe(404);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
