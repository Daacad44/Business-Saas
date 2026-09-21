import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { registerAndOnboard } from "./customers-test-helpers.js";
import { createProduct, setStock } from "./sales-test-helpers.js";

const app = createApp();

describe("POST /api/v1/sales/:id/return", () => {
  it("brings stock back via a new RETURN_IN movement and conserves quantity", async () => {
    const owner = await registerAndOnboard(app, "ReturnHappyPath");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "20.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "10",
      userId: owner.userId,
    });

    const saleRes = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      type: "CASH",
      items: [{ productId: product.id, quantity: 5, unitPrice: 20 }],
    });
    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data;
    const saleItemId = sale.items[0].id as string;

    const levelAfterSale = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(levelAfterSale?.quantity.toString()).toBe("5");

    const returnRes = await owner.agent
      .post(`/api/v1/sales/${sale.id}/return`)
      .send({ items: [{ saleItemId, quantity: 2 }], reason: "Customer changed mind" });

    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.totalAmount).toBe("40.00");
    expect(returnRes.body.data.items).toHaveLength(1);
    expect(returnRes.body.data.items[0].movementId).toBeTruthy();

    const movement = await prisma.stockMovement.findFirst({
      where: { businessId: owner.businessId, referenceType: "SALES_RETURN", referenceId: returnRes.body.data.id },
    });
    expect(movement?.type).toBe("RETURN_IN");
    expect(movement?.quantity.toString()).toBe("2");

    const levelAfterReturn = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(levelAfterReturn?.quantity.toString()).toBe("7");
  });

  it("rejects a return that exceeds the sold quantity (accounting for prior returns)", async () => {
    const owner = await registerAndOnboard(app, "ReturnOverReturn");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "20.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "10",
      userId: owner.userId,
    });

    const saleRes = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      type: "CASH",
      items: [{ productId: product.id, quantity: 3, unitPrice: 20 }],
    });
    const sale = saleRes.body.data;
    const saleItemId = sale.items[0].id as string;

    const firstReturn = await owner.agent
      .post(`/api/v1/sales/${sale.id}/return`)
      .send({ items: [{ saleItemId, quantity: 2 }] });
    expect(firstReturn.status).toBe(201);

    const secondReturn = await owner.agent
      .post(`/api/v1/sales/${sale.id}/return`)
      .send({ items: [{ saleItemId, quantity: 2 }] });
    expect(secondReturn.status).toBe(409);

    const returns = await prisma.salesReturn.count({ where: { businessId: owner.businessId, saleId: sale.id } });
    expect(returns).toBe(1);

    const level = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(level?.quantity.toString()).toBe("9");
  });

  it("adjusts the linked debt and customer balance when returning goods from a credit sale", async () => {
    const owner = await registerAndOnboard(app, "ReturnCreditAdjust");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "25.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "10",
      userId: owner.userId,
    });
    const customerRes = await owner.agent.post("/api/v1/customers").send({
      fullName: "Return Credit Customer",
      creditLimit: 1000,
    });
    const customerId = customerRes.body.data.id as string;

    const saleRes = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      type: "CREDIT",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      items: [{ productId: product.id, quantity: 4, unitPrice: 25 }],
    });
    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data;
    expect(sale.totalAmount).toBe("100.00");
    const saleItemId = sale.items[0].id as string;

    const returnRes = await owner.agent
      .post(`/api/v1/sales/${sale.id}/return`)
      .send({ items: [{ saleItemId, quantity: 1 }] });
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.totalAmount).toBe("25.00");
    expect(returnRes.body.data.invoice.totalAmount).toBe("75.00");
    expect(returnRes.body.data.invoice.amountDue).toBe("75.00");
    expect(returnRes.body.data.debt.principalAmount).toBe("75.00");
    expect(returnRes.body.data.debt.outstandingAmount).toBe("75.00");
    expect(returnRes.body.data.customerBalance).toBe("75.00");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(customer?.currentBalance.toString()).toBe("75");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
