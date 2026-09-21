import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { registerAndOnboard } from "./customers-test-helpers.js";
import { createProduct, setStock } from "./sales-test-helpers.js";

const app = createApp();

describe("Full Critical Flow: credit sale -> invoice -> partial payment -> final payment -> reconciliation", () => {
  it("reconciles the debt and customer balance to exactly 0.00 after two payments", async () => {
    const owner = await registerAndOnboard(app, "CriticalFlowA");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "60.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "20",
      userId: owner.userId,
    });
    const customerRes = await owner.agent.post("/api/v1/customers").send({
      fullName: "Critical Flow Customer",
      creditLimit: 1000,
    });
    const customerId = customerRes.body.data.id as string;

    // Sale -> Invoice -> Outstanding Balance -> Debt -> Due Date
    const saleRes = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      type: "CREDIT",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      items: [{ productId: product.id, quantity: 2, unitPrice: 60 }],
    });
    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data;
    expect(sale.totalAmount).toBe("120.00");
    expect(sale.invoice.status).toBe("ISSUED");
    expect(sale.invoice.amountDue).toBe("120.00");
    expect(sale.debt.outstandingAmount).toBe("120.00");
    expect(sale.customerBalance).toBe("120.00");

    // Payment -> partial: remaining balance correct
    const partial = await owner.agent
      .post(`/api/v1/sales/${sale.id}/payment`)
      .send({ amount: 50, method: "CASH" });
    expect(partial.status).toBe(201);
    expect(partial.body.data.invoice.status).toBe("PARTIALLY_PAID");
    expect(partial.body.data.invoice.amountPaid).toBe("50.00");
    expect(partial.body.data.invoice.amountDue).toBe("70.00");
    expect(partial.body.data.debt.status).toBe("PARTIALLY_PAID");
    expect(partial.body.data.debt.amountPaid).toBe("50.00");
    expect(partial.body.data.debt.outstandingAmount).toBe("70.00");
    expect(partial.body.data.customerBalance).toBe("70.00");

    // Final payment -> Debt Reconciliation: exactly 0.00
    const final = await owner.agent
      .post(`/api/v1/sales/${sale.id}/payment`)
      .send({ amount: 70, method: "MOBILE_MONEY" });
    expect(final.status).toBe(201);
    expect(final.body.data.invoice.status).toBe("PAID");
    expect(final.body.data.invoice.amountPaid).toBe("120.00");
    expect(final.body.data.invoice.amountDue).toBe("0.00");
    expect(final.body.data.debt.status).toBe("PAID");
    expect(final.body.data.debt.outstandingAmount).toBe("0.00");
    expect(final.body.data.customerBalance).toBe("0.00");

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(customer?.currentBalance.toString()).toBe("0");

    const debt = await prisma.customerDebt.findFirst({ where: { businessId: owner.businessId, invoiceId: sale.invoice.id } });
    expect(debt?.status).toBe("PAID");
    expect(debt?.outstandingAmount.toString()).toBe("0");

    const payments = await prisma.payment.findMany({ where: { businessId: owner.businessId, invoiceId: sale.invoice.id } });
    expect(payments).toHaveLength(2);
    const totalCollected = payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    expect(totalCollected.toString()).toBe("120");
  });
});

describe("Overpayment rejected", () => {
  it("rejects a payment amount greater than the invoice's amountDue", async () => {
    const owner = await registerAndOnboard(app, "OverpaymentA");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "40.00" });
    await setStock({
      businessId: owner.businessId,
      warehouseId: owner.warehouseId,
      productId: product.id,
      quantity: "10",
      userId: owner.userId,
    });
    const customerRes = await owner.agent.post("/api/v1/customers").send({
      fullName: "Overpay Customer",
      creditLimit: 500,
    });
    const customerId = customerRes.body.data.id as string;

    const saleRes = await owner.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      customerId,
      type: "CREDIT",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      items: [{ productId: product.id, quantity: 1, unitPrice: 40 }],
    });
    const sale = saleRes.body.data;
    expect(sale.totalAmount).toBe("40.00");

    const overpay = await owner.agent
      .post(`/api/v1/sales/${sale.id}/payment`)
      .send({ amount: 100, method: "CASH" });
    expect(overpay.status).toBe(409);

    const invoice = await prisma.invoice.findFirst({ where: { businessId: owner.businessId, id: sale.invoice.id } });
    expect(invoice?.amountDue.toString()).toBe("40");
    expect(invoice?.status).toBe("ISSUED");

    const payments = await prisma.payment.count({ where: { businessId: owner.businessId, invoiceId: sale.invoice.id } });
    expect(payments).toBe(0);
  });

  it("rejects any further payment once a cash sale's invoice is already PAID", async () => {
    const owner = await registerAndOnboard(app, "OverpaymentCash");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "10.00" });
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
      items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
    });
    const sale = saleRes.body.data;

    const attempt = await owner.agent.post(`/api/v1/sales/${sale.id}/payment`).send({ amount: 1, method: "CASH" });
    expect(attempt.status).toBe(409);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
