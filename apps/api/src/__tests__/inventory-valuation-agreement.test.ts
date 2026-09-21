import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  createProduct,
  createProductVariant,
  createStockLevel,
  createWarehouse,
  registerAndOnboard,
} from "../modules/reports/__test-support__/fixtures.js";

const app = createApp();

/**
 * Defect 2 regression guard: `GET /inventory/stock-levels/valuation` and
 * `GET /reports/inventory/valuation` must always agree, because both now
 * delegate to the single shared `computeStockValuation()`
 * (`inventory/valuation.service.ts`). This fixture is deliberately
 * non-trivial:
 *   - two warehouses
 *   - a product with a variant whose costPrice overrides the parent
 *     product's costPrice
 *   - a zero-quantity line (must contribute exactly 0, not be skipped or
 *     cause a divergence)
 *   - a decimal cost (`3 * 3.33`) that would expose any premature
 *     per-line rounding
 */
describe("inventory valuation: the two endpoints agree exactly", () => {
  it("produces the same total and per-warehouse figures from both endpoints", async () => {
    const tenant = await registerAndOnboard(app, "ValuationAgree");
    const warehouseB = await createWarehouse(tenant.businessId, tenant.branchId, { name: "Zeta Warehouse" });

    // Plain product, no variant, warehouse A: 10 * 4.50 = 45.00
    const productA = await createProduct(tenant.businessId, { costPrice: 4.5 });
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: productA.id,
      quantity: 10,
    });

    // Product with a variant whose cost OVERRIDES the parent's cost.
    // Parent costPrice = 100 (must NOT be used); variant costPrice = 3.33.
    // Warehouse A: 3 * 3.33 = 9.99 (exposes rounding if summed carelessly).
    const productB = await createProduct(tenant.businessId, { costPrice: 100 });
    const variantB = await createProductVariant(tenant.businessId, productB.id, { costPrice: 3.33 });
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: productB.id,
      variantId: variantB.id,
      quantity: 3,
    });

    // Zero-quantity line: must contribute exactly 0 and not be dropped or
    // cause a divergence between the two implementations.
    const productC = await createProduct(tenant.businessId, { costPrice: 7.77 });
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: productC.id,
      quantity: 0,
    });

    // Second warehouse, same product A at a different quantity:
    // Warehouse B: 5 * 4.50 = 22.50
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: warehouseB.id,
      productId: productA.id,
      quantity: 5,
    });

    // Grand total = 45.00 + 9.99 + 0 + 22.50 = 77.49
    const inventoryValuation = await tenant.agent.get("/api/v1/inventory/stock-levels/valuation");
    const reportsValuation = await tenant.agent.get("/api/v1/reports/inventory/valuation");

    expect(inventoryValuation.status).toBe(200);
    expect(reportsValuation.status).toBe(200);

    expect(inventoryValuation.body.data.totalValue).toBe("77.49");
    expect(reportsValuation.body.data.totalValuation).toBe("77.49");

    const inventoryByWarehouse = new Map<string, string>(
      (inventoryValuation.body.data.byWarehouse as Array<{ warehouseId: string; value: string }>).map((row) => [
        row.warehouseId,
        row.value,
      ]),
    );
    const reportsByWarehouse = new Map<string, string>(
      (reportsValuation.body.data.byWarehouse as Array<{ warehouseId: string; valuation: string }>).map((row) => [
        row.warehouseId,
        row.valuation,
      ]),
    );

    expect(inventoryByWarehouse.get(tenant.warehouseId)).toBe("54.99"); // 45.00 + 9.99 + 0
    expect(reportsByWarehouse.get(tenant.warehouseId)).toBe("54.99");
    expect(inventoryByWarehouse.get(warehouseB.id)).toBe("22.50");
    expect(reportsByWarehouse.get(warehouseB.id)).toBe("22.50");

    // The two endpoints must agree on every warehouse present in either response.
    expect(new Set(inventoryByWarehouse.keys())).toEqual(new Set(reportsByWarehouse.keys()));
    for (const [warehouseId, value] of inventoryByWarehouse) {
      expect(reportsByWarehouse.get(warehouseId)).toBe(value);
    }
  });

  it("filters both endpoints identically by warehouseId", async () => {
    const tenant = await registerAndOnboard(app, "ValuationAgreeFilter");
    const warehouseB = await createWarehouse(tenant.businessId, tenant.branchId);

    const product = await createProduct(tenant.businessId, { costPrice: 2 });
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: product.id,
      quantity: 10,
    });
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: warehouseB.id,
      productId: product.id,
      quantity: 40,
    });

    const inventoryFiltered = await tenant.agent
      .get("/api/v1/inventory/stock-levels/valuation")
      .query({ warehouseId: tenant.warehouseId });
    const reportsFiltered = await tenant.agent
      .get("/api/v1/reports/inventory/valuation")
      .query({ warehouseId: tenant.warehouseId });

    expect(inventoryFiltered.body.data.totalValue).toBe("20.00");
    expect(reportsFiltered.body.data.totalValuation).toBe("20.00");
    expect(inventoryFiltered.body.data.byWarehouse).toHaveLength(1);
    expect(reportsFiltered.body.data.byWarehouse).toHaveLength(1);
  });

  it("rounds the true Prisma.Decimal sum at the response boundary, not per-line", async () => {
    const tenant = await registerAndOnboard(app, "ValuationRounding");
    const warehouseB = await createWarehouse(tenant.businessId, tenant.branchId, { name: "Beta Warehouse" });

    // qty 1.111 * cost 1.11 = 1.23321 per warehouse.
    // Rounding each line first then summing: 1.23 + 1.23 = 2.46.
    // Rounding the true sum: 2.46642 -> "2.47".
    const product = await createProduct(tenant.businessId, { costPrice: 1.11 });
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: product.id,
      quantity: 1.111,
    });
    await createStockLevel({
      businessId: tenant.businessId,
      warehouseId: warehouseB.id,
      productId: product.id,
      quantity: 1.111,
    });

    const inventoryValuation = await tenant.agent.get("/api/v1/inventory/stock-levels/valuation");
    const reportsValuation = await tenant.agent.get("/api/v1/reports/inventory/valuation");

    expect(inventoryValuation.status).toBe(200);
    expect(reportsValuation.status).toBe(200);

    expect(inventoryValuation.body.data.totalValue).toBe("2.47");
    expect(reportsValuation.body.data.totalValuation).toBe("2.47");
    expect(inventoryValuation.body.data.totalValue).not.toBe("2.46");

    const inventoryByWarehouse = inventoryValuation.body.data.byWarehouse as Array<{
      warehouseId: string;
      value: string;
    }>;
    const reportsByWarehouse = reportsValuation.body.data.byWarehouse as Array<{
      warehouseId: string;
      valuation: string;
    }>;
    expect(inventoryByWarehouse.map((row) => row.value).sort()).toEqual(["1.23", "1.23"]);
    expect(reportsByWarehouse.map((row) => row.valuation).sort()).toEqual(["1.23", "1.23"]);
    expect(reportsValuation.body.data.totalQuantity).toBe("2.222");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
