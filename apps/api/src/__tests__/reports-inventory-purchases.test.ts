import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  createBatch,
  createExpense,
  createExpenseCategory,
  createProduct,
  createPurchase,
  createStockLevel,
  createStockMovement,
  createSupplier,
  registerAndOnboard,
} from "../modules/reports/__test-support__/fixtures.js";

const app = createApp();

describe("reports: inventory valuation", () => {
  it("computes exact per-warehouse and total valuation from quantity * unit cost", async () => {
    const tenant = await registerAndOnboard(app, "RptInvValuation");
    const productA = await createProduct(tenant.businessId, { costPrice: 4.5 });
    const productB = await createProduct(tenant.businessId, { costPrice: 2.25 });

    await createStockLevel({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: productA.id, quantity: 10 });
    await createStockLevel({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: productB.id, quantity: 4 });

    const res = await tenant.agent.get("/api/v1/reports/inventory/valuation");
    expect(res.status).toBe(200);
    // 10 * 4.50 + 4 * 2.25 = 45.00 + 9.00 = 54.00
    expect(res.body.data.totalValuation).toBe("54.00");
    expect(res.body.data.totalQuantity).toBe("14.000");
    expect(res.body.data.byWarehouse).toHaveLength(1);
    expect(res.body.data.byWarehouse[0].valuation).toBe("54.00");
  });
});

describe("reports: low-stock and out-of-stock detection", () => {
  it("flags rows at/under threshold as LOW_STOCK and zero/negative rows as OUT_OF_STOCK", async () => {
    const tenant = await registerAndOnboard(app, "RptLowStock");
    const lowProduct = await createProduct(tenant.businessId);
    const outProduct = await createProduct(tenant.businessId);
    const healthyProduct = await createProduct(tenant.businessId);

    await createStockLevel({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: lowProduct.id, quantity: 5, reorderLevel: 10 });
    await createStockLevel({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: outProduct.id, quantity: 0, reorderLevel: 10 });
    await createStockLevel({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: healthyProduct.id, quantity: 100, reorderLevel: 10 });

    const res = await tenant.agent.get("/api/v1/reports/inventory/low-stock");
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ productId: string; status: string }>;
    const ids = rows.map((r) => r.productId);
    expect(ids).toContain(lowProduct.id);
    expect(ids).toContain(outProduct.id);
    expect(ids).not.toContain(healthyProduct.id);
    expect(rows.find((r) => r.productId === outProduct.id)?.status).toBe("OUT_OF_STOCK");
    expect(rows.find((r) => r.productId === lowProduct.id)?.status).toBe("LOW_STOCK");
  });
});

describe("reports: expiring/expired batches", () => {
  it("includes batches within the horizon and flags already-expired ones", async () => {
    const tenant = await registerAndOnboard(app, "RptExpiring");
    const product = await createProduct(tenant.businessId);
    const now = new Date();

    const expiredBatch = await createBatch({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: product.id,
      quantity: 3,
      expiryDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    const soonBatch = await createBatch({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: product.id,
      quantity: 2,
      expiryDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    });
    const farBatch = await createBatch({
      businessId: tenant.businessId,
      warehouseId: tenant.warehouseId,
      productId: product.id,
      quantity: 1,
      expiryDate: new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000),
    });

    const res = await tenant.agent.get("/api/v1/reports/inventory/expiring-batches").query({ days: 30 });
    expect(res.status).toBe(200);
    const batchIds = (res.body.data as Array<{ batchId: string; isExpired: boolean }>).map((r) => r.batchId);
    expect(batchIds).toContain(expiredBatch.id);
    expect(batchIds).toContain(soonBatch.id);
    expect(batchIds).not.toContain(farBatch.id);

    const expiredRow = (res.body.data as Array<{ batchId: string; isExpired: boolean }>).find(
      (r) => r.batchId === expiredBatch.id,
    );
    expect(expiredRow?.isExpired).toBe(true);
    const soonRow = (res.body.data as Array<{ batchId: string; isExpired: boolean }>).find(
      (r) => r.batchId === soonBatch.id,
    );
    expect(soonRow?.isExpired).toBe(false);
  });
});

describe("reports: stock movement summary", () => {
  it("groups movement quantity and count by type within range", async () => {
    const tenant = await registerAndOnboard(app, "RptMovements");
    const product = await createProduct(tenant.businessId);
    const now = new Date();

    await createStockMovement({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: product.id, type: "PURCHASE_IN", quantity: 20, createdAt: now });
    await createStockMovement({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: product.id, type: "SALE_OUT", quantity: 5, createdAt: now });
    await createStockMovement({ businessId: tenant.businessId, warehouseId: tenant.warehouseId, productId: product.id, type: "SALE_OUT", quantity: 3, createdAt: now });

    const res = await tenant.agent.get("/api/v1/reports/inventory/movements");
    expect(res.status).toBe(200);
    const rows = res.body.data.byType as Array<{ type: string; quantity: string; movementCount: number }>;
    expect(rows.find((r) => r.type === "PURCHASE_IN")?.quantity).toBe("20.000");
    expect(rows.find((r) => r.type === "SALE_OUT")?.quantity).toBe("8.000");
    expect(rows.find((r) => r.type === "SALE_OUT")?.movementCount).toBe(2);
  });
});

describe("reports: purchases, expenses, and payables correctness", () => {
  it("computes exact spend totals by supplier and by category, and outstanding payables", async () => {
    const tenant = await registerAndOnboard(app, "RptPurchExp");
    const product = await createProduct(tenant.businessId);
    const supplier = await createSupplier(tenant.businessId);
    const now = new Date();

    await createPurchase({
      businessId: tenant.businessId,
      supplierId: supplier.id,
      warehouseId: tenant.warehouseId,
      receivedAt: now,
      items: [{ productId: product.id, quantity: 10, unitCost: 4.25 }],
    });
    await createPurchase({
      businessId: tenant.businessId,
      supplierId: supplier.id,
      warehouseId: tenant.warehouseId,
      receivedAt: now,
      items: [{ productId: product.id, quantity: 2, unitCost: 3.5 }],
    });

    const purchases = await tenant.agent.get("/api/v1/reports/purchases");
    expect(purchases.status).toBe(200);
    // (10 * 4.25) + (2 * 3.5) = 42.50 + 7.00 = 49.50
    expect(purchases.body.data.totals.totalSpend).toBe("49.50");
    expect(purchases.body.data.totals.purchaseCount).toBe(2);
    const supplierRow = (purchases.body.data.bySupplier as Array<{ supplierId: string; totalSpend: string }>).find(
      (s) => s.supplierId === supplier.id,
    );
    expect(supplierRow?.totalSpend).toBe("49.50");

    const category = await createExpenseCategory(tenant.businessId, "Rent");
    await createExpense({ businessId: tenant.businessId, categoryId: category.id, amount: 100.5, expenseDate: now });
    await createExpense({ businessId: tenant.businessId, categoryId: category.id, amount: 25.25, expenseDate: now });

    const expenses = await tenant.agent.get("/api/v1/reports/expenses");
    expect(expenses.status).toBe(200);
    expect(expenses.body.data.totals.totalSpend).toBe("125.75");
    expect(expenses.body.data.byCategory[0].totalSpend).toBe("125.75");

    await prisma.supplier.update({ where: { id: supplier.id }, data: { currentBalance: 49.5 } });
    const payables = await tenant.agent.get("/api/v1/reports/payables");
    expect(payables.status).toBe(200);
    expect(payables.body.data.totalPayable).toBe("49.50");
    expect(payables.body.data.suppliers[0].outstandingBalance).toBe("49.50");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
