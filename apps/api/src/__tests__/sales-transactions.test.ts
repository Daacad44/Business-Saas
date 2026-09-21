import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { registerAndOnboard } from "./customers-test-helpers.js";
import { createProduct, setStock } from "./sales-test-helpers.js";

const app = createApp();

async function setup(label: string) {
  return registerAndOnboard(app, label);
}

describe("POST /api/v1/sales — cash sale happy path", () => {
  it("computes totals with Decimal, creates exactly one movement per line, decrements stock, and marks the invoice PAID", async () => {
    const owner = await setup("SaleCashA");
    const product = await createProduct({
      businessId: owner.businessId,
      sellingPrice: "10.00",
      costPrice: "6.00",
      taxRate: "15",
    });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "100",
      userId: owner.userId,
    });

    const res = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      type: "CASH",
      items: [{ productId: product.id, quantity: 3, unitPrice: 10, discountAmount: 0, taxAmount: 0 }],
    });

    expect(res.status).toBe(201);
    // subtotal = 10 * 3 = 30.00, tax = 30 * 15% = 4.50, total = 34.50
    expect(res.body.data.subtotal).toBe("30.00");
    expect(res.body.data.taxAmount).toBe("4.50");
    expect(res.body.data.totalAmount).toBe("34.50");
    expect(res.body.data.invoice.status).toBe("PAID");
    expect(res.body.data.invoice.amountPaid).toBe("34.50");
    expect(res.body.data.invoice.amountDue).toBe("0.00");
    expect(res.body.data.payment.amount).toBe("34.50");
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].movementId).toBeTruthy();

    const saleId = res.body.data.id as string;
    const movements = await prisma.stockMovement.findMany({
      where: { businessId: owner.businessId, referenceType: "SALE", referenceId: saleId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.quantity.toString()).toBe("-3");

    const level = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(level?.quantity.toString()).toBe("97");
  });

  it("ignores a client-supplied unit price and always recomputes from the product record", async () => {
    const owner = await setup("SalePriceIntegrity");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "20.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "10",
      userId: owner.userId,
    });

    const res = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      type: "CASH",
      items: [{ productId: product.id, quantity: 1, unitPrice: 0.01 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].unitPrice).toBe("20.00");
    expect(res.body.data.totalAmount).toBe("20.00");
  });
});

describe("POST /api/v1/sales — credit sale happy path", () => {
  it("creates a debt linked to the invoice, sets the due date, and updates the customer balance", async () => {
    const owner = await setup("SaleCreditA");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "50.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "20",
      userId: owner.userId,
    });
    const customerRes = await owner.agent.post("/api/v1/customers").send({
      fullName: "Credit Buyer",
      creditLimit: 1000,
    });
    const customerId = customerRes.body.data.id as string;

    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      type: "CREDIT",
      dueDate,
      items: [{ productId: product.id, quantity: 2, unitPrice: 50 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.totalAmount).toBe("100.00");
    expect(res.body.data.invoice.status).toBe("ISSUED");
    expect(res.body.data.invoice.amountDue).toBe("100.00");
    expect(res.body.data.payment).toBeNull();
    expect(res.body.data.debt.principalAmount).toBe("100.00");
    expect(res.body.data.debt.outstandingAmount).toBe("100.00");
    expect(res.body.data.debt.invoiceId).toBe(res.body.data.invoice.id);
    expect(new Date(res.body.data.debt.dueDate).toISOString().slice(0, 10)).toBe(dueDate.slice(0, 10));
    expect(res.body.data.customerBalance).toBe("100.00");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(customer?.currentBalance.toString()).toBe("100");
  });
});

describe("POST /api/v1/sales — credit rejected over limit", () => {
  it("rejects with 409 and leaves ZERO side effects", async () => {
    const owner = await setup("SaleCreditReject");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "50.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "20",
      userId: owner.userId,
    });
    const customerRes = await owner.agent.post("/api/v1/customers").send({
      fullName: "Over Limit Buyer",
      creditLimit: 10,
    });
    const customerId = customerRes.body.data.id as string;

    const salesBefore = await prisma.sale.count({ where: { businessId: owner.businessId } });
    const invoicesBefore = await prisma.invoice.count({ where: { businessId: owner.businessId } });
    const movementsBefore = await prisma.stockMovement.count({ where: { businessId: owner.businessId } });
    const debtsBefore = await prisma.customerDebt.count({ where: { businessId: owner.businessId } });

    const res = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      type: "CREDIT",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      items: [{ productId: product.id, quantity: 2, unitPrice: 50 }],
    });

    expect(res.status).toBe(409);

    const salesAfter = await prisma.sale.count({ where: { businessId: owner.businessId } });
    const invoicesAfter = await prisma.invoice.count({ where: { businessId: owner.businessId } });
    const movementsAfter = await prisma.stockMovement.count({ where: { businessId: owner.businessId } });
    const debtsAfter = await prisma.customerDebt.count({ where: { businessId: owner.businessId } });

    expect(salesAfter).toBe(salesBefore);
    expect(invoicesAfter).toBe(invoicesBefore);
    expect(movementsAfter).toBe(movementsBefore);
    expect(debtsAfter).toBe(debtsBefore);

    const level = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(level?.quantity.toString()).toBe("20");
  });
});

describe("POST /api/v1/sales — insufficient stock rejected", () => {
  it("rejects with 409 and leaves ZERO side effects", async () => {
    const owner = await setup("SaleInsufficientStock");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "50.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "1",
      userId: owner.userId,
    });

    const salesBefore = await prisma.sale.count({ where: { businessId: owner.businessId } });
    const movementsBefore = await prisma.stockMovement.count({
      where: { businessId: owner.businessId, referenceType: "SALE" },
    });

    const res = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      type: "CASH",
      items: [{ productId: product.id, quantity: 5, unitPrice: 50 }],
    });

    expect(res.status).toBe(409);

    const salesAfter = await prisma.sale.count({ where: { businessId: owner.businessId } });
    const movementsAfter = await prisma.stockMovement.count({
      where: { businessId: owner.businessId, referenceType: "SALE" },
    });
    expect(salesAfter).toBe(salesBefore);
    expect(movementsAfter).toBe(movementsBefore);

    const level = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(level?.quantity.toString()).toBe("1");
  });
});

describe("POST /api/v1/sales — cross-tenant foreign key attack", () => {
  it("rejects a productId belonging to another business with 404 and writes nothing", async () => {
    const ownerA = await setup("SaleFkAttackA1");
    const ownerB = await setup("SaleFkAttackB1");
    const productB = await createProduct({ businessId: ownerB.businessId, sellingPrice: "10.00" });
    await setStock({
      businessId: ownerB.businessId,
      warehouseId: ownerB.warehouseId,
      productId: productB.id,
      quantity: "50",
      userId: ownerB.userId,
    });

    const res = await ownerA.agent.post("/api/v1/sales").send({
      branchId: ownerA.branchId,
      warehouseId: ownerA.warehouseId,
      type: "CASH",
      items: [{ productId: productB.id, quantity: 1, unitPrice: 10 }],
    });

    expect(res.status).toBe(404);
    const salesA = await prisma.sale.count({ where: { businessId: ownerA.businessId } });
    expect(salesA).toBe(0);
  });

  it("rejects a warehouseId belonging to another business with 404 and writes nothing", async () => {
    const ownerA = await setup("SaleFkAttackA2");
    const ownerB = await setup("SaleFkAttackB2");
    const productA = await createProduct({ businessId: ownerA.businessId, sellingPrice: "10.00" });
    await setStock({
      businessId: ownerA.businessId,
      warehouseId: ownerA.warehouseId,
      productId: productA.id,
      quantity: "50",
      userId: ownerA.userId,
    });

    const res = await ownerA.agent.post("/api/v1/sales").send({
      branchId: ownerA.branchId,
      warehouseId: ownerB.warehouseId,
      type: "CASH",
      items: [{ productId: productA.id, quantity: 1, unitPrice: 10 }],
    });

    expect(res.status).toBe(404);
    const salesA = await prisma.sale.count({ where: { businessId: ownerA.businessId } });
    expect(salesA).toBe(0);
  });

  it("rejects a branchId belonging to another business with 404 and writes nothing", async () => {
    const ownerA = await setup("SaleFkAttackA3");
    const ownerB = await setup("SaleFkAttackB3");
    const productA = await createProduct({ businessId: ownerA.businessId, sellingPrice: "10.00" });

    const res = await ownerA.agent.post("/api/v1/sales").send({
      branchId: ownerB.branchId,
      warehouseId: ownerA.warehouseId,
      type: "CASH",
      items: [{ productId: productA.id, quantity: 1, unitPrice: 10 }],
    });

    expect(res.status).toBe(404);
    const salesA = await prisma.sale.count({ where: { businessId: ownerA.businessId } });
    expect(salesA).toBe(0);
  });

  it("rejects a customerId belonging to another business with 404 and writes nothing", async () => {
    const ownerA = await setup("SaleFkAttackA4");
    const ownerB = await setup("SaleFkAttackB4");
    const productA = await createProduct({ businessId: ownerA.businessId, sellingPrice: "10.00" });
    await setStock({
      businessId: ownerA.businessId,
      warehouseId: ownerA.warehouseId,
      productId: productA.id,
      quantity: "50",
      userId: ownerA.userId,
    });
    const customerB = await ownerB.agent.post("/api/v1/customers").send({ fullName: "B's Customer" });
    const customerIdB = customerB.body.data.id as string;

    const res = await ownerA.agent.post("/api/v1/sales").send({
      branchId: ownerA.branchId,
      warehouseId: ownerA.warehouseId,
      customerId: customerIdB,
      type: "CREDIT",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      items: [{ productId: productA.id, quantity: 1, unitPrice: 10 }],
    });

    expect(res.status).toBe(404);
    const salesA = await prisma.sale.count({ where: { businessId: ownerA.businessId } });
    expect(salesA).toBe(0);
  });
});

describe("Transaction atomicity", () => {
  it("rolls back everything, including a successfully-applied earlier line, when a later line fails mid-transaction", async () => {
    const owner = await setup("SaleAtomicity");
    const goodProduct = await createProduct({ businessId: owner.businessId, sellingPrice: "10.00" });
    const badProduct = await createProduct({ businessId: owner.businessId, sellingPrice: "10.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: goodProduct.id,
      quantity: "10",
      userId: owner.userId,
    });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: badProduct.id,
      quantity: "1",
      userId: owner.userId,
    });

    const res = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      type: "CASH",
      items: [
        { productId: goodProduct.id, quantity: 5, unitPrice: 10 },
        { productId: badProduct.id, quantity: 5, unitPrice: 10 },
      ],
    });

    expect(res.status).toBe(409);

    const sales = await prisma.sale.count({ where: { businessId: owner.businessId } });
    const invoices = await prisma.invoice.count({ where: { businessId: owner.businessId } });
    expect(sales).toBe(0);
    expect(invoices).toBe(0);

    const goodMovements = await prisma.stockMovement.count({
      where: { businessId: owner.businessId, productId: goodProduct.id, referenceType: "SALE" },
    });
    expect(goodMovements).toBe(0);

    const goodLevel = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: goodProduct.id },
    });
    expect(goodLevel?.quantity.toString()).toBe("10");
  });
});

describe("Concurrency — last unit contention", () => {
  it("does not allow two simultaneous sales of the last unit to both succeed", async () => {
    const owner = await setup("SaleConcurrency");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "10.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "1",
      userId: owner.userId,
    });

    const attempt = () =>
      owner.agent.post("/api/v1/sales").send({
        branchId: owner.branchId,
        warehouseId: owner.warehouseId,
        type: "CASH",
        items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
      });

    const [first, second] = await Promise.all([attempt(), attempt()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const level = await prisma.stockLevel.findFirst({
      where: { businessId: owner.businessId, warehouseId: owner.warehouseId, productId: product.id },
    });
    expect(level?.quantity.toString()).toBe("0");

    const movements = await prisma.stockMovement.count({
      where: { businessId: owner.businessId, productId: product.id, referenceType: "SALE" },
    });
    expect(movements).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
