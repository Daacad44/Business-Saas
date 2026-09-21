import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  createCustomer,
  createProduct,
  registerAndOnboard,
  seedCashSale,
  seedCreditSaleWithDebt,
} from "../modules/reports/__test-support__/fixtures.js";

const app = createApp();

describe("reports: sales correctness (exact decimal precision)", () => {
  it("computes exact revenue, tax/discount totals, and average basket value to the cent", async () => {
    const tenant = await registerAndOnboard(app, "RptCorrectSales");
    const productA = await createProduct(tenant.businessId, { costPrice: 3.33, sellingPrice: 19.99 });
    const productB = await createProduct(tenant.businessId, { costPrice: 1.11, sellingPrice: 9.01 });
    const now = new Date();

    // Sale 1: 3 x 19.99 = 59.97
    await seedCashSale({
      businessId: tenant.businessId,
      branchId: tenant.branchId,
      warehouseId: tenant.warehouseId,
      soldAt: now,
      items: [{ productId: productA.id, quantity: 3, unitPrice: 19.99, costPriceSnapshot: 3.33 }],
    });

    // Sale 2: 2 x 9.01 = 18.02
    await seedCashSale({
      businessId: tenant.businessId,
      branchId: tenant.branchId,
      warehouseId: tenant.warehouseId,
      soldAt: now,
      items: [{ productId: productB.id, quantity: 2, unitPrice: 9.01, costPriceSnapshot: 1.11 }],
    });

    const res = await tenant.agent.get("/api/v1/reports/sales");
    expect(res.status).toBe(200);
    // 59.97 + 18.02 = 77.99
    expect(res.body.data.totals.revenue).toBe("77.99");
    expect(res.body.data.totals.transactionCount).toBe(2);
    // average basket value = 77.99 / 2 = 38.995 -> rounds to 39.00 (Decimal.toFixed uses ROUND_HALF_UP by default)
    expect(res.body.data.totals.averageBasketValue).toBe("39.00");

    const profit = await tenant.agent.get("/api/v1/reports/profit");
    expect(profit.status).toBe(200);
    // cost = 3*3.33 + 2*1.11 = 9.99 + 2.22 = 12.21
    expect(profit.body.data.totals.cost).toBe("12.21");
    // profit = 77.99 - 12.21 = 65.78
    expect(profit.body.data.totals.grossProfit).toBe("65.78");

    const byProduct = await tenant.agent.get("/api/v1/reports/sales/by-product");
    const rowA = (byProduct.body.data as Array<{ productId: string; revenue: string; quantitySold: string }>).find(
      (r) => r.productId === productA.id,
    );
    expect(rowA?.revenue).toBe("59.97");
    expect(rowA?.quantitySold).toBe("3.000");
  });
});

describe("reports: date-range filtering (both boundaries inclusive)", () => {
  it("excludes sales outside [startDate, endDate] and includes both boundary instants", async () => {
    const tenant = await registerAndOnboard(app, "RptDateRange");
    const product = await createProduct(tenant.businessId, { sellingPrice: 50 });

    const boundaryStart = new Date("2024-03-10T00:00:00.000Z");
    const beforeRange = new Date("2024-03-09T23:59:59.999Z");
    const insideRange = new Date("2024-03-15T12:00:00.000Z");
    const boundaryEnd = new Date("2024-03-20T00:00:00.000Z");
    const afterRange = new Date("2024-03-20T00:00:00.001Z");

    await seedCashSale({
      businessId: tenant.businessId,
      branchId: tenant.branchId,
      warehouseId: tenant.warehouseId,
      soldAt: beforeRange,
      items: [{ productId: product.id, quantity: 1, unitPrice: 50 }],
    });
    await seedCashSale({
      businessId: tenant.businessId,
      branchId: tenant.branchId,
      warehouseId: tenant.warehouseId,
      soldAt: boundaryStart,
      items: [{ productId: product.id, quantity: 1, unitPrice: 50 }],
    });
    await seedCashSale({
      businessId: tenant.businessId,
      branchId: tenant.branchId,
      warehouseId: tenant.warehouseId,
      soldAt: insideRange,
      items: [{ productId: product.id, quantity: 1, unitPrice: 50 }],
    });
    await seedCashSale({
      businessId: tenant.businessId,
      branchId: tenant.branchId,
      warehouseId: tenant.warehouseId,
      soldAt: boundaryEnd,
      items: [{ productId: product.id, quantity: 1, unitPrice: 50 }],
    });
    await seedCashSale({
      businessId: tenant.businessId,
      branchId: tenant.branchId,
      warehouseId: tenant.warehouseId,
      soldAt: afterRange,
      items: [{ productId: product.id, quantity: 1, unitPrice: 50 }],
    });

    const res = await tenant.agent.get("/api/v1/reports/sales").query({
      startDate: boundaryStart.toISOString(),
      endDate: boundaryEnd.toISOString(),
    });
    expect(res.status).toBe(200);
    // boundaryStart, insideRange, and boundaryEnd all fall within the inclusive [startDate, endDate] window.
    expect(res.body.data.totals.transactionCount).toBe(3);
    expect(res.body.data.totals.revenue).toBe("150.00");
  });
});

describe("reports: receivables aging buckets", () => {
  it("places debts into the correct aging bucket relative to `asOf`", async () => {
    const tenant = await registerAndOnboard(app, "RptAgingBuckets");
    const customer = await createCustomer(tenant.businessId);
    const product = await createProduct(tenant.businessId, { sellingPrice: 100 });
    const asOf = new Date("2024-06-15T00:00:00.000Z");

    const scenarios: Array<{ daysOverdue: number; expectedBucket: string }> = [
      { daysOverdue: -5, expectedBucket: "current" },
      { daysOverdue: 0, expectedBucket: "current" },
      { daysOverdue: 15, expectedBucket: "1-30" },
      { daysOverdue: 45, expectedBucket: "31-60" },
      { daysOverdue: 75, expectedBucket: "61-90" },
      { daysOverdue: 120, expectedBucket: "90+" },
    ];

    for (const scenario of scenarios) {
      const dueDate = new Date(asOf.getTime() - scenario.daysOverdue * 24 * 60 * 60 * 1000);
      await seedCreditSaleWithDebt({
        businessId: tenant.businessId,
        branchId: tenant.branchId,
        warehouseId: tenant.warehouseId,
        customerId: customer.id,
        soldAt: dueDate,
        dueDate,
        items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
      });
    }

    const res = await tenant.agent.get("/api/v1/reports/receivables/aging").query({ asOf: asOf.toISOString() });
    expect(res.status).toBe(200);
    const buckets = res.body.data.buckets as Array<{ bucket: string; outstanding: string; debtCount: number }>;
    for (const scenario of scenarios) {
      const bucket = buckets.find((b) => b.bucket === scenario.expectedBucket);
      expect(bucket, `bucket ${scenario.expectedBucket} should exist`).toBeTruthy();
    }
    // "current" bucket should have exactly 2 debts (daysOverdue -5 and 0)
    expect(buckets.find((b) => b.bucket === "current")?.debtCount).toBe(2);
    expect(buckets.find((b) => b.bucket === "1-30")?.debtCount).toBe(1);
    expect(buckets.find((b) => b.bucket === "31-60")?.debtCount).toBe(1);
    expect(buckets.find((b) => b.bucket === "61-90")?.debtCount).toBe(1);
    expect(buckets.find((b) => b.bucket === "90+")?.debtCount).toBe(1);
    expect(res.body.data.totalOutstanding).toBe("600.00");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
