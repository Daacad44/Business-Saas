import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createProductFixture, registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

describe("Goods receipt atomicity", () => {
  it("rolls back the entire transaction (no orphan Purchase, PurchaseItem, or StockMovement) when a later line fails validation", async () => {
    const owner = await registerAndOnboard(app, "AtomicMidFailA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Atomic Supplier" });
    const supplierId = supplier.body.data.id as string;
    const goodProduct = await createProductFixture({ businessId: owner.businessId });

    const purchaseCountBefore = await prisma.purchase.count({ where: { businessId: owner.businessId } });
    const itemCountBefore = await prisma.purchaseItem.count({ where: { businessId: owner.businessId } });
    const movementCountBefore = await prisma.stockMovement.count({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: goodProduct.id },
    });
    const stockLevelBefore = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: goodProduct.id },
    });

    // Second line references a productId that does not exist at all — this fails
    // validation AFTER the first line's stock movement + PurchaseItem would have
    // already been created within the same transaction.
    const attempt = await owner.agent.post("/api/v1/purchases").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [
        { productId: goodProduct.id, quantity: 5, unitCost: 2 },
        { productId: "does-not-exist", quantity: 1, unitCost: 1 },
      ],
    });
    expect(attempt.status).toBe(404);

    const purchaseCountAfter = await prisma.purchase.count({ where: { businessId: owner.businessId } });
    const itemCountAfter = await prisma.purchaseItem.count({ where: { businessId: owner.businessId } });
    const movementCountAfter = await prisma.stockMovement.count({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: goodProduct.id },
    });
    const stockLevelAfter = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: goodProduct.id },
    });

    expect(purchaseCountAfter).toBe(purchaseCountBefore);
    expect(itemCountAfter).toBe(itemCountBefore);
    expect(movementCountAfter).toBe(movementCountBefore);
    expect(stockLevelAfter?.quantity ?? null).toEqual(stockLevelBefore?.quantity ?? null);

    const refreshedProduct = await prisma.product.findUniqueOrThrow({ where: { id: goodProduct.id } });
    expect(refreshedProduct.costPrice.toFixed(2)).toBe(goodProduct.costPrice.toFixed(2));
  });

  it("rolls back a purchase return entirely when an over-return line follows a valid line", async () => {
    const owner = await registerAndOnboard(app, "AtomicReturnFailA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Atomic Return Supplier" });
    const supplierId = supplier.body.data.id as string;
    const productA = await createProductFixture({ businessId: owner.businessId });
    const productB = await createProductFixture({ businessId: owner.businessId });

    const receive = await owner.agent.post("/api/v1/purchases").send({
      supplierId,
      warehouseId: owner.warehouseId,
      items: [
        { productId: productA.id, quantity: 10, unitCost: 2 },
        { productId: productB.id, quantity: 4, unitCost: 3 },
      ],
    });
    const purchaseId = receive.body.data.id as string;
    const items = receive.body.data.items as Array<{ id: string; productId: string }>;
    const itemA = items.find((item) => item.productId === productA.id)!;
    const itemB = items.find((item) => item.productId === productB.id)!;

    const returnCountBefore = await prisma.purchaseReturn.count({ where: { businessId: owner.businessId } });
    const movementCountBefore = await prisma.stockMovement.count({ where: { businessId: owner.businessId } });

    const attempt = await owner.agent.post(`/api/v1/purchases/${purchaseId}/returns`).send({
      items: [
        { purchaseItemId: itemA.id, quantity: 3 },
        { purchaseItemId: itemB.id, quantity: 999 }, // exceeds received quantity -> 409, whole tx rolls back
      ],
    });
    expect(attempt.status).toBe(409);

    const returnCountAfter = await prisma.purchaseReturn.count({ where: { businessId: owner.businessId } });
    const movementCountAfter = await prisma.stockMovement.count({ where: { businessId: owner.businessId } });
    expect(returnCountAfter).toBe(returnCountBefore);
    expect(movementCountAfter).toBe(movementCountBefore);

    const levelA = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: productA.id },
    });
    expect(levelA?.quantity.toFixed(3)).toBe("10.000");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
