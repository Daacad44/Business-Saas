import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  createBatch,
  createCustomer,
  createDebtPayment,
  createExpense,
  createExpenseCategory,
  createPayment,
  createProduct,
  createPurchase,
  createStockLevel,
  createStockMovement,
  createSupplier,
  registerAndOnboard,
  seedCashSale,
  seedCreditSaleWithDebt,
} from "../modules/reports/__test-support__/fixtures.js";

const app = createApp();

async function seedTenant(label: string, opts: { revenue: number; lowStockQty: number; supplierBalance: number }) {
  const tenant = await registerAndOnboard(app, label);
  const product = await createProduct(tenant.businessId, { costPrice: 10, sellingPrice: opts.revenue });
  const customer = await createCustomer(tenant.businessId);
  const supplier = await createSupplier(tenant.businessId);

  const now = new Date();

  await seedCashSale({
    businessId: tenant.businessId,
    branchId: tenant.branchId,
    warehouseId: tenant.warehouseId,
    soldAt: now,
    items: [{ productId: product.id, quantity: 1, unitPrice: opts.revenue, costPriceSnapshot: 10 }],
  });

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { debt } = await seedCreditSaleWithDebt({
    businessId: tenant.businessId,
    branchId: tenant.branchId,
    warehouseId: tenant.warehouseId,
    customerId: customer.id,
    soldAt: yesterday,
    dueDate: yesterday,
    items: [{ productId: product.id, quantity: 1, unitPrice: opts.revenue }],
  });

  await createPayment({ businessId: tenant.businessId, customerId: customer.id, amount: opts.revenue, paidAt: now });
  await createDebtPayment({ businessId: tenant.businessId, debtId: debt.id, amount: 0.01, paidAt: now });

  await createStockLevel({
    businessId: tenant.businessId,
    warehouseId: tenant.warehouseId,
    productId: product.id,
    quantity: opts.lowStockQty,
    reorderLevel: 10,
  });

  await createBatch({
    businessId: tenant.businessId,
    warehouseId: tenant.warehouseId,
    productId: product.id,
    quantity: 5,
    expiryDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
  });

  await createStockMovement({
    businessId: tenant.businessId,
    warehouseId: tenant.warehouseId,
    productId: product.id,
    type: "SALE_OUT",
    quantity: 1,
  });

  await createPurchase({
    businessId: tenant.businessId,
    supplierId: supplier.id,
    warehouseId: tenant.warehouseId,
    receivedAt: now,
    items: [{ productId: product.id, quantity: 1, unitCost: opts.revenue }],
  });

  const category = await createExpenseCategory(tenant.businessId);
  await createExpense({
    businessId: tenant.businessId,
    categoryId: category.id,
    amount: opts.revenue,
    expenseDate: now,
  });

  await prisma.supplier.update({
    where: { id: supplier.id },
    data: { currentBalance: opts.supplierBalance },
  });

  return { ...tenant, product, customer, supplier, debt };
}

describe("reports: tenant isolation", () => {
  it("every report endpoint returns only the requesting tenant's data", async () => {
    const tenantA = await seedTenant("RptIsoA", { revenue: 100, lowStockQty: 5, supplierBalance: 15 });
    const tenantB = await seedTenant("RptIsoB", { revenue: 500, lowStockQty: 5, supplierBalance: 800 });

    // Dashboard
    const dashboard = await tenantA.agent.get("/api/v1/reports/dashboard");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.today.revenue).toBe("100.00");
    expect(dashboard.body.data.lowStockCount).toBe(1);
    expect(dashboard.body.data.overdueDebtCount).toBe(1);

    // Sales report
    const sales = await tenantA.agent.get("/api/v1/reports/sales");
    expect(sales.status).toBe(200);
    expect(sales.body.data.totals.revenue).toBe("200.00");
    expect(sales.body.data.totals.transactionCount).toBe(2);

    // Sales by product — must not contain tenant B's product
    const byProduct = await tenantA.agent.get("/api/v1/reports/sales/by-product");
    expect(byProduct.status).toBe(200);
    const productIdsA = (byProduct.body.data as Array<{ productId: string }>).map((p) => p.productId);
    expect(productIdsA).toContain(tenantA.product.id);
    expect(productIdsA).not.toContain(tenantB.product.id);

    // Sales by branch
    const byBranch = await tenantA.agent.get("/api/v1/reports/sales/by-branch");
    expect(byBranch.status).toBe(200);
    const branchIdsA = (byBranch.body.data as Array<{ branchId: string }>).map((b) => b.branchId);
    expect(branchIdsA).toContain(tenantA.branchId);
    expect(branchIdsA).not.toContain(tenantB.branchId);

    // Sales by customer
    const byCustomer = await tenantA.agent.get("/api/v1/reports/sales/by-customer");
    expect(byCustomer.status).toBe(200);
    const customerIdsA = (byCustomer.body.data as Array<{ customerId: string | null }>).map((c) => c.customerId);
    expect(customerIdsA).not.toContain(tenantB.customer.id);

    // Sales by payment method
    const byMethod = await tenantA.agent.get("/api/v1/reports/sales/by-payment-method");
    expect(byMethod.status).toBe(200);
    const cashRow = (byMethod.body.data as Array<{ method: string; amount: string }>).find((r) => r.method === "CASH");
    expect(cashRow?.amount).toBe("100.00");

    // Top products
    const topProducts = await tenantA.agent.get("/api/v1/reports/sales/top-products");
    expect(topProducts.status).toBe(200);
    const topIdsA = (topProducts.body.data as Array<{ productId: string }>).map((p) => p.productId);
    expect(topIdsA).not.toContain(tenantB.product.id);

    // Inventory valuation
    const valuation = await tenantA.agent.get("/api/v1/reports/inventory/valuation");
    expect(valuation.status).toBe(200);
    const warehouseIdsA = (valuation.body.data.byWarehouse as Array<{ warehouseId: string }>).map((w) => w.warehouseId);
    expect(warehouseIdsA).not.toContain(tenantB.warehouseId);

    // Stock movement summary
    const movements = await tenantA.agent.get("/api/v1/reports/inventory/movements");
    expect(movements.status).toBe(200);
    const saleOutRow = (movements.body.data.byType as Array<{ type: string; quantity: string }>).find(
      (r) => r.type === "SALE_OUT",
    );
    expect(saleOutRow?.quantity).toBe("1.000");

    // Low stock
    const lowStock = await tenantA.agent.get("/api/v1/reports/inventory/low-stock");
    expect(lowStock.status).toBe(200);
    const lowStockProductIdsA = (lowStock.body.data as Array<{ productId: string }>).map((r) => r.productId);
    expect(lowStockProductIdsA).toContain(tenantA.product.id);
    expect(lowStockProductIdsA).not.toContain(tenantB.product.id);

    // Expiring batches
    const expiring = await tenantA.agent.get("/api/v1/reports/inventory/expiring-batches");
    expect(expiring.status).toBe(200);
    const expiringProductIdsA = (expiring.body.data as Array<{ productId: string }>).map((r) => r.productId);
    expect(expiringProductIdsA).toContain(tenantA.product.id);
    expect(expiringProductIdsA).not.toContain(tenantB.product.id);

    // Slow moving
    const slowMoving = await tenantA.agent.get("/api/v1/reports/inventory/slow-moving");
    expect(slowMoving.status).toBe(200);
    for (const row of slowMoving.body.data as Array<{ productId: string }>) {
      expect(row.productId).not.toBe(tenantB.product.id);
    }

    // Profit
    const profit = await tenantA.agent.get("/api/v1/reports/profit");
    expect(profit.status).toBe(200);
    expect(profit.body.data.totals.revenue).toBe("200.00");

    // Profit by product
    const profitByProduct = await tenantA.agent.get("/api/v1/reports/profit/by-product");
    expect(profitByProduct.status).toBe(200);
    const profitProductIdsA = (profitByProduct.body.data as Array<{ productId: string }>).map((r) => r.productId);
    expect(profitProductIdsA).not.toContain(tenantB.product.id);

    // Receivables aging
    const aging = await tenantA.agent.get("/api/v1/reports/receivables/aging");
    expect(aging.status).toBe(200);
    expect(aging.body.data.totalOutstanding).toBe("100.00");
    const agingCustomerIdsA = (aging.body.data.byCustomer as Array<{ customerId: string }>).map((c) => c.customerId);
    expect(agingCustomerIdsA).not.toContain(tenantB.customer.id);

    // Collections summary
    const collections = await tenantA.agent.get("/api/v1/reports/receivables/collections");
    expect(collections.status).toBe(200);
    expect(collections.body.data.totalCollected).toBe("0.01");

    // Purchases
    const purchases = await tenantA.agent.get("/api/v1/reports/purchases");
    expect(purchases.status).toBe(200);
    expect(purchases.body.data.totals.totalSpend).toBe("100.00");
    const supplierIdsA = (purchases.body.data.bySupplier as Array<{ supplierId: string }>).map((s) => s.supplierId);
    expect(supplierIdsA).not.toContain(tenantB.supplier.id);

    // Expenses
    const expenses = await tenantA.agent.get("/api/v1/reports/expenses");
    expect(expenses.status).toBe(200);
    expect(expenses.body.data.totals.totalSpend).toBe("100.00");

    // Payables
    const payables = await tenantA.agent.get("/api/v1/reports/payables");
    expect(payables.status).toBe(200);
    expect(payables.body.data.totalPayable).toBe("15.00");
    const payableSupplierIdsA = (payables.body.data.suppliers as Array<{ supplierId: string }>).map((s) => s.supplierId);
    expect(payableSupplierIdsA).not.toContain(tenantB.supplier.id);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
