import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { addMemberWithRole, registerAndOnboard } from "../modules/reports/__test-support__/fixtures.js";

const app = createApp();

const ALL_ENDPOINTS = [
  "/api/v1/reports/dashboard",
  "/api/v1/reports/sales",
  "/api/v1/reports/sales/by-branch",
  "/api/v1/reports/sales/by-customer",
  "/api/v1/reports/sales/by-product",
  "/api/v1/reports/sales/by-payment-method",
  "/api/v1/reports/sales/top-products",
  "/api/v1/reports/inventory/valuation",
  "/api/v1/reports/inventory/movements",
  "/api/v1/reports/inventory/low-stock",
  "/api/v1/reports/inventory/expiring-batches",
  "/api/v1/reports/inventory/slow-moving",
  "/api/v1/reports/profit",
  "/api/v1/reports/profit/by-product",
  "/api/v1/reports/receivables/aging",
  "/api/v1/reports/receivables/collections",
  "/api/v1/reports/purchases",
  "/api/v1/reports/expenses",
  "/api/v1/reports/payables",
];

describe("reports: permission enforcement", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/v1/reports/dashboard");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without reports.read (cashier role) on every report endpoint", async () => {
    const owner = await registerAndOnboard(app, "RptPermOwner");
    const cashier = await addMemberWithRole(app, owner.businessId, "cashier", "RptPermCashier");

    for (const path of ALL_ENDPOINTS) {
      const res = await cashier.agent.get(path);
      expect(res.status, `expected 403 for ${path}`).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("allows the owner (has reports.read) to access every report endpoint", async () => {
    const owner = await registerAndOnboard(app, "RptPermOwner2");

    for (const path of ALL_ENDPOINTS) {
      const res = await owner.agent.get(path);
      expect(res.status, `expected 200 for ${path}`).toBe(200);
    }
  });
});

describe("reports: query validation", () => {
  it("rejects an inverted date range with 422", async () => {
    const owner = await registerAndOnboard(app, "RptValInverted");
    const res = await owner.agent
      .get("/api/v1/reports/sales")
      .query({ startDate: "2024-06-01T00:00:00.000Z", endDate: "2024-01-01T00:00:00.000Z" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a date range exceeding the maximum window with 422", async () => {
    const owner = await registerAndOnboard(app, "RptValOversized");
    const res = await owner.agent.get("/api/v1/reports/sales").query({
      startDate: "2020-01-01T00:00:00.000Z",
      endDate: "2024-01-01T00:00:00.000Z",
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an out-of-range page size with 422", async () => {
    const owner = await registerAndOnboard(app, "RptValLimit");
    const res = await owner.agent.get("/api/v1/reports/sales/by-product").query({ limit: 100000 });
    expect(res.status).toBe(422);
  });

  it("rejects an invalid groupBy value with 422", async () => {
    const owner = await registerAndOnboard(app, "RptValGroupBy");
    const res = await owner.agent.get("/api/v1/reports/sales").query({ groupBy: "year" });
    expect(res.status).toBe(422);
  });

  it("accepts a valid, in-range date query", async () => {
    const owner = await registerAndOnboard(app, "RptValOk");
    const res = await owner.agent.get("/api/v1/reports/sales").query({
      startDate: "2024-01-01T00:00:00.000Z",
      endDate: "2024-01-31T23:59:59.999Z",
      groupBy: "day",
    });
    expect(res.status).toBe(200);
  });
});

describe("reports: empty-data handling", () => {
  it("returns well-formed zero values for a fresh business with no data", async () => {
    const owner = await registerAndOnboard(app, "RptEmpty");

    const dashboard = await owner.agent.get("/api/v1/reports/dashboard");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.today.revenue).toBe("0.00");
    expect(dashboard.body.data.today.transactionCount).toBe(0);
    expect(dashboard.body.data.today.grossProfit).toBe("0.00");
    expect(dashboard.body.data.today.cashCollected).toBe("0.00");
    expect(dashboard.body.data.outstandingReceivables).toBe("0.00");
    expect(dashboard.body.data.lowStockCount).toBe(0);
    expect(dashboard.body.data.overdueDebtCount).toBe(0);

    const sales = await owner.agent.get("/api/v1/reports/sales");
    expect(sales.body.data.totals.revenue).toBe("0.00");
    expect(sales.body.data.totals.averageBasketValue).toBe("0.00");
    expect(sales.body.data.breakdown).toEqual([]);

    const byProduct = await owner.agent.get("/api/v1/reports/sales/by-product");
    expect(byProduct.body.data).toEqual([]);

    const valuation = await owner.agent.get("/api/v1/reports/inventory/valuation");
    expect(valuation.body.data.totalValuation).toBe("0.00");
    expect(valuation.body.data.byWarehouse).toEqual([]);

    const lowStock = await owner.agent.get("/api/v1/reports/inventory/low-stock");
    expect(lowStock.body.data).toEqual([]);

    const profit = await owner.agent.get("/api/v1/reports/profit");
    expect(profit.body.data.totals.revenue).toBe("0.00");
    expect(profit.body.data.totals.marginPercent).toBe("0.00");

    const aging = await owner.agent.get("/api/v1/reports/receivables/aging");
    expect(aging.body.data.totalOutstanding).toBe("0.00");
    for (const bucket of aging.body.data.buckets) {
      expect(bucket.outstanding).toBe("0.00");
      expect(bucket.debtCount).toBe(0);
    }

    const collections = await owner.agent.get("/api/v1/reports/receivables/collections");
    expect(collections.body.data.totalCollected).toBe("0.00");

    const purchases = await owner.agent.get("/api/v1/reports/purchases");
    expect(purchases.body.data.totals.totalSpend).toBe("0.00");

    const expenses = await owner.agent.get("/api/v1/reports/expenses");
    expect(expenses.body.data.totals.totalSpend).toBe("0.00");

    const payables = await owner.agent.get("/api/v1/reports/payables");
    expect(payables.body.data.totalPayable).toBe("0.00");
    expect(payables.body.data.suppliers).toEqual([]);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
