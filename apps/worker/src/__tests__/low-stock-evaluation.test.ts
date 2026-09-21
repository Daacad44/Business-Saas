import { afterAll, describe, expect, it } from "vitest";
import { findLowStockMatches } from "../automation/trigger-evaluator.js";
import { prisma } from "../lib/prisma.js";
import { createStockLevel, createTestProduct, createTestTenant, createTestVariant } from "./test-helpers.js";

describe("findLowStockMatches", () => {
  it("matches a product whose quantity is below its lowStockThreshold", async () => {
    const tenant = await createTestTenant("LowStockBelow");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 10 });
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 3);

    const matches = await findLowStockMatches(tenant.businessId);

    expect(matches.some((m) => m.stockLevelId === level.id)).toBe(true);
  });

  it("matches a product whose quantity is exactly AT the threshold (report semantics: lte)", async () => {
    const tenant = await createTestTenant("LowStockAtThreshold");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 10 });
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 10);

    const matches = await findLowStockMatches(tenant.businessId);

    expect(matches.some((m) => m.stockLevelId === level.id)).toBe(true);
  });

  it("does NOT match a product whose quantity is above the threshold", async () => {
    const tenant = await createTestTenant("LowStockAbove");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 10 });
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 25);

    const matches = await findLowStockMatches(tenant.businessId);

    expect(matches.some((m) => m.stockLevelId === level.id)).toBe(false);
  });

  it("handles a variant-level stock line, reading the threshold from the parent product", async () => {
    const tenant = await createTestTenant("LowStockVariant");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 8 });
    const variant = await createTestVariant(tenant.businessId, product.id);
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 2, { variantId: variant.id });

    const matches = await findLowStockMatches(tenant.businessId);
    const match = matches.find((m) => m.stockLevelId === level.id);

    expect(match).toBeDefined();
    expect(match?.variantId).toBe(variant.id);
    expect(match?.threshold.toString()).toBe("8");
  });

  it("prefers StockLevel.reorderLevel over Product.lowStockThreshold when both are set", async () => {
    const tenant = await createTestTenant("LowStockReorderLevel");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 100 });
    // Quantity is above lowStockThreshold-based reading but at/below the stock line's own reorderLevel.
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 20, { reorderLevel: 20 });

    const matches = await findLowStockMatches(tenant.businessId);
    const match = matches.find((m) => m.stockLevelId === level.id);

    expect(match).toBeDefined();
    expect(match?.threshold.toString()).toBe("20");
  });

  it("never matches a product with no threshold configured at all", async () => {
    const tenant = await createTestTenant("LowStockNoThreshold");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: null });
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 0);

    const matches = await findLowStockMatches(tenant.businessId);

    expect(matches.some((m) => m.stockLevelId === level.id)).toBe(false);
  });

  it("never matches a product with trackStock = false, mirroring the inventory report", async () => {
    const tenant = await createTestTenant("LowStockNoTrack");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 50, trackStock: false });
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 0);

    const matches = await findLowStockMatches(tenant.businessId);

    expect(matches.some((m) => m.stockLevelId === level.id)).toBe(false);
  });

  describe("tenant isolation", () => {
    it("never returns business B's low stock lines when scanning business A", async () => {
      const tenantA = await createTestTenant("LowStockIsoA");
      const tenantB = await createTestTenant("LowStockIsoB");

      const productA = await createTestProduct(tenantA.businessId, { lowStockThreshold: 10 });
      const productB = await createTestProduct(tenantB.businessId, { lowStockThreshold: 10 });

      await createStockLevel(tenantA.businessId, tenantA.warehouseId, productA.id, 1);
      const levelB = await createStockLevel(tenantB.businessId, tenantB.warehouseId, productB.id, 1);

      const matchesA = await findLowStockMatches(tenantA.businessId);

      expect(matchesA.every((m) => m.businessId === tenantA.businessId)).toBe(true);
      expect(matchesA.some((m) => m.stockLevelId === levelB.id)).toBe(false);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
