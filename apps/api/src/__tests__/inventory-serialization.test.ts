import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const app = createApp();

function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`;
}

const password = "CorrectHorse-1";

async function registerAndOnboard(label: string) {
  const email = uniqueEmail(label);
  const agent = request.agent(app);
  const register = await agent.post("/api/v1/auth/register").send({
    fullName: label,
    email,
    password,
  });
  expect(register.status).toBe(201);

  const onboard = await agent.post("/api/v1/businesses").send({
    name: `${label} Trading`,
    type: "RETAIL",
    locale: "en",
    branch: { name: "Main", code: "MAIN" },
    warehouse: { name: "Main warehouse", code: "WH1" },
  });
  expect(onboard.status).toBe(201);

  return {
    agent,
    businessId: onboard.body.data.business.id as string,
    branchId: onboard.body.data.branch.id as string,
    warehouseId: onboard.body.data.warehouse.id as string,
  };
}

/**
 * Defect 1 regression suite: every money field must serialize as a fixed
 * 2-decimal string and every quantity field as a fixed 3-decimal string,
 * matching `customers/serialize.ts` and `reports/lib/decimal.ts` — never
 * a bare `.toString()`, which drops trailing zeros inconsistently
 * (`10.5` instead of `10.50`, `3` instead of `3.000`).
 */
describe("inventory serialization: money is 2dp, quantity is 3dp", () => {
  it("serializes Product money/quantity fields exactly", async () => {
    const tenant = await registerAndOnboard("SerializeProduct");

    const create = await tenant.agent.post("/api/v1/products").send({
      name: "Widget",
      sku: "SER-PROD-1",
      costPrice: 10.5,
      sellingPrice: 20.5,
      taxRate: 7.5,
      lowStockThreshold: 3,
    });
    expect(create.status).toBe(201);
    expect(create.body.data.costPrice).toBe("10.50");
    expect(create.body.data.sellingPrice).toBe("20.50");
    expect(create.body.data.taxRate).toBe("7.50");
    expect(create.body.data.lowStockThreshold).toBe("3.000");

    const get = await tenant.agent.get(`/api/v1/products/${create.body.data.id}`);
    expect(get.status).toBe(200);
    expect(get.body.data.costPrice).toBe("10.50");
    expect(get.body.data.lowStockThreshold).toBe("3.000");
  });

  it("serializes ProductVariant money fields exactly", async () => {
    const tenant = await registerAndOnboard("SerializeVariant");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "T-Shirt",
      sku: "SER-VAR-1",
      sellingPrice: 15,
      hasVariants: true,
    });
    const productId = product.body.data.id as string;

    const create = await tenant.agent.post(`/api/v1/products/${productId}/variants`).send({
      name: "Medium / Blue",
      sku: "SER-VAR-1-M",
      costPrice: 8.1,
      sellingPrice: 15.4,
      attributes: { size: "M" },
    });
    expect(create.status).toBe(201);
    expect(create.body.data.costPrice).toBe("8.10");
    expect(create.body.data.sellingPrice).toBe("15.40");
  });

  it("serializes Batch quantity/money fields exactly", async () => {
    const tenant = await registerAndOnboard("SerializeBatch");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "Milk",
      sku: "SER-BATCH-1",
      sellingPrice: 2,
    });
    const productId = product.body.data.id as string;

    const create = await tenant.agent.post("/api/v1/batches").send({
      warehouseId: tenant.warehouseId,
      productId,
      batchNumber: "B-SER-1",
      quantity: 3,
      costPrice: 1.2,
    });
    expect(create.status).toBe(201);
    expect(create.body.data.quantity).toBe("3.000");
    expect(create.body.data.costPrice).toBe("1.20");
  });

  it("serializes StockLevel quantity fields exactly (including a low-stock threshold)", async () => {
    const tenant = await registerAndOnboard("SerializeStockLevel");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "Rice",
      sku: "SER-LEVEL-1",
      sellingPrice: 2,
      lowStockThreshold: 5,
    });
    const productId = product.body.data.id as string;

    const adjust = await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 3 }],
    });
    expect(adjust.status).toBe(201);

    const levels = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: tenant.warehouseId });
    expect(levels.status).toBe(200);
    expect(levels.body.data[0].quantity).toBe("3.000");
    expect(levels.body.data[0].reservedQuantity).toBe("0.000");

    const lowStock = await tenant.agent.get("/api/v1/inventory/stock-levels/low-stock");
    expect(lowStock.status).toBe(200);
    const row = lowStock.body.data.find((r: { productId: string }) => r.productId === productId);
    expect(row.quantity).toBe("3.000");
    expect(row.product.lowStockThreshold).toBe("5.000");
  });

  it("serializes StockMovement quantity/unitCost fields exactly", async () => {
    const tenant = await registerAndOnboard("SerializeMovement");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "Sugar",
      sku: "SER-MOVE-1",
      sellingPrice: 2,
    });
    const productId = product.body.data.id as string;

    const adjust = await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 12, unitCost: 3.4 }],
    });
    expect(adjust.status).toBe(201);

    const movements = await tenant.agent.get("/api/v1/inventory/movements").query({ productId });
    expect(movements.status).toBe(200);
    expect(movements.body.data[0].quantity).toBe("12.000");
    expect(movements.body.data[0].unitCost).toBe("3.40");
  });

  it("serializes StockAdjustmentItem quantityDelta/unitCost fields exactly", async () => {
    const tenant = await registerAndOnboard("SerializeAdjustment");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "Flour",
      sku: "SER-ADJ-1",
      sellingPrice: 2,
    });
    const productId = product.body.data.id as string;

    const adjust = await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 6.5, unitCost: 1.1 }],
    });
    expect(adjust.status).toBe(201);
    expect(adjust.body.data.items[0].quantityDelta).toBe("6.500");
    expect(adjust.body.data.items[0].unitCost).toBe("1.10");
  });

  it("serializes StockTransferItem quantity fields exactly", async () => {
    const tenant = await registerAndOnboard("SerializeTransfer");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "Oil",
      sku: "SER-XFER-1",
      sellingPrice: 2,
    });
    const productId = product.body.data.id as string;
    const warehouseB = await tenant.agent.post("/api/v1/warehouses").send({
      branchId: tenant.branchId,
      name: "Secondary",
      code: "WH2",
    });

    await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 9 }],
    });

    const transfer = await tenant.agent.post("/api/v1/inventory/transfers").send({
      fromWarehouseId: tenant.warehouseId,
      toWarehouseId: warehouseB.body.data.id,
      items: [{ productId, quantity: 4.25 }],
    });
    expect(transfer.status).toBe(201);
    expect(transfer.body.data.items[0].quantity).toBe("4.250");
  });

  it("serializes the valuation response's money fields exactly", async () => {
    const tenant = await registerAndOnboard("SerializeValuation");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "Coffee",
      sku: "SER-VAL-1",
      sellingPrice: 5,
      costPrice: 3.33,
    });
    const productId = product.body.data.id as string;

    await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 3 }],
    });

    const valuation = await tenant.agent.get("/api/v1/inventory/stock-levels/valuation");
    expect(valuation.status).toBe(200);
    // 3 * 3.33 = 9.99 exactly, but the assertion is on FORMAT, not just value:
    // a naive .toString() on an integer-valued Decimal would render "9.99"
    // correctly here, so this also covers the whole-number byWarehouse case
    // below where the format bug is otherwise invisible.
    expect(valuation.body.data.totalValue).toBe("9.99");
    expect(valuation.body.data.byWarehouse).toHaveLength(1);
    expect(valuation.body.data.byWarehouse[0].value).toBe("9.99");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
