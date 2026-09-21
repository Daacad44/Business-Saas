import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, createProductFixture, registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

async function receivePurchase(
  owner: Awaited<ReturnType<typeof registerAndOnboard>>,
  supplierId: string,
  productId: string,
  quantity: number,
  unitCost: number,
) {
  const receive = await owner.agent.post("/api/v1/purchases").send({
    supplierId,
    warehouseId: owner.warehouseId,
    items: [{ productId, quantity, unitCost }],
  });
  expect(receive.status).toBe(201);
  return receive.body.data as { id: string; amountDue: string; totalAmount: string };
}

describe("Supplier payment reconciliation", () => {
  it("settles amountDue to exactly 0.00 via a partial then a final payment", async () => {
    const owner = await registerAndOnboard(app, "PayReconcileA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Reconcile Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const purchase = await receivePurchase(owner, supplierId, product.id, 10, 15); // total 150.00

    const partial = await owner.agent.post(`/api/v1/suppliers/${supplierId}/payments`).send({
      purchaseId: purchase.id,
      amount: 100,
      method: "CASH",
    });
    expect(partial.status).toBe(201);

    let purchaseGet = await owner.agent.get(`/api/v1/purchases/${purchase.id}`);
    expect(purchaseGet.body.data.amountPaid).toBe("100.00");
    expect(purchaseGet.body.data.amountDue).toBe("50.00");

    const final = await owner.agent.post(`/api/v1/suppliers/${supplierId}/payments`).send({
      purchaseId: purchase.id,
      amount: 50,
      method: "CASH",
    });
    expect(final.status).toBe(201);
    expect(final.body.data.supplierCurrentBalance).toBe("0.00");

    purchaseGet = await owner.agent.get(`/api/v1/purchases/${purchase.id}`);
    expect(purchaseGet.body.data.amountPaid).toBe("150.00");
    expect(purchaseGet.body.data.amountDue).toBe("0.00");

    const supplierGet = await owner.agent.get(`/api/v1/suppliers/${supplierId}`);
    expect(supplierGet.body.data.currentBalance).toBe("0.00");
  });

  it("rejects overpayment against a specific purchase with 409", async () => {
    const owner = await registerAndOnboard(app, "PayOverpayA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Overpay Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const purchase = await receivePurchase(owner, supplierId, product.id, 2, 10); // total 20.00

    const overpay = await owner.agent.post(`/api/v1/suppliers/${supplierId}/payments`).send({
      purchaseId: purchase.id,
      amount: 25,
      method: "CASH",
    });
    expect(overpay.status).toBe(409);

    const purchaseGet = await owner.agent.get(`/api/v1/purchases/${purchase.id}`);
    expect(purchaseGet.body.data.amountPaid).toBe("0.00");
    expect(purchaseGet.body.data.amountDue).toBe("20.00");
  });

  it("applies a general (no purchaseId) payment FIFO across outstanding purchases", async () => {
    const owner = await registerAndOnboard(app, "PayFifoA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "FIFO Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    const first = await receivePurchase(owner, supplierId, product.id, 1, 30); // 30.00
    const second = await receivePurchase(owner, supplierId, product.id, 1, 20); // 20.00

    const payment = await owner.agent.post(`/api/v1/suppliers/${supplierId}/payments`).send({
      amount: 40,
      method: "CASH",
    });
    expect(payment.status).toBe(201);
    expect(payment.body.data.supplierCurrentBalance).toBe("10.00");

    const firstGet = await owner.agent.get(`/api/v1/purchases/${first.id}`);
    const secondGet = await owner.agent.get(`/api/v1/purchases/${second.id}`);
    expect(firstGet.body.data.amountDue).toBe("0.00");
    expect(secondGet.body.data.amountDue).toBe("10.00");
  });

  it("rejects a general overpayment beyond the supplier's total outstanding balance", async () => {
    const owner = await registerAndOnboard(app, "PayFifoOverpayA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "FIFO Overpay Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });

    await receivePurchase(owner, supplierId, product.id, 1, 10); // 10.00

    const overpay = await owner.agent.post(`/api/v1/suppliers/${supplierId}/payments`).send({
      amount: 999,
      method: "CASH",
    });
    expect(overpay.status).toBe(409);
  });

  it("rejects a payment referencing another supplier's purchase with 404", async () => {
    const owner = await registerAndOnboard(app, "PayCrossSupplierA");
    const supplierA = await owner.agent.post("/api/v1/suppliers").send({ name: "Supplier A" });
    const supplierB = await owner.agent.post("/api/v1/suppliers").send({ name: "Supplier B" });
    const product = await createProductFixture({ businessId: owner.businessId });

    const purchase = await receivePurchase(owner, supplierA.body.data.id, product.id, 1, 10);

    const attempt = await owner.agent.post(`/api/v1/suppliers/${supplierB.body.data.id}/payments`).send({
      purchaseId: purchase.id,
      amount: 5,
      method: "CASH",
    });
    expect(attempt.status).toBe(404);
  });

  it("returns payment history for a supplier", async () => {
    const owner = await registerAndOnboard(app, "PayHistoryA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "History Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });
    const purchase = await receivePurchase(owner, supplierId, product.id, 1, 10);

    await owner.agent.post(`/api/v1/suppliers/${supplierId}/payments`).send({
      purchaseId: purchase.id,
      amount: 4,
      method: "CASH",
    });

    const history = await owner.agent.get(`/api/v1/suppliers/${supplierId}/payments`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].amount).toBe("4.00");

    const payablesHistory = await owner.agent.get("/api/v1/payables/payments").query({ supplierId });
    expect(payablesHistory.status).toBe(200);
    expect(payablesHistory.body.data).toHaveLength(1);
  });

  it("enforces the purchases.create permission for recording a payment", async () => {
    const owner = await registerAndOnboard(app, "PayPermA");
    const limited = await createLimitedMember(app, owner, "PayPermMember", ["purchases.read"]);
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Perm Supplier" });
    const product = await createProductFixture({ businessId: owner.businessId });
    const purchase = await receivePurchase(owner, supplier.body.data.id, product.id, 1, 10);

    const attempt = await limited.agent.post(`/api/v1/suppliers/${supplier.body.data.id}/payments`).send({
      purchaseId: purchase.id,
      amount: 1,
      method: "CASH",
    });
    expect(attempt.status).toBe(403);
  });
});

describe("Payables read endpoints", () => {
  it("lists outstanding balances per supplier and an aging report", async () => {
    const owner = await registerAndOnboard(app, "PayablesReadA");
    const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Payables Supplier" });
    const supplierId = supplier.body.data.id as string;
    const product = await createProductFixture({ businessId: owner.businessId });
    await receivePurchase(owner, supplierId, product.id, 2, 25); // 50.00 due

    const outstanding = await owner.agent.get("/api/v1/payables/outstanding");
    expect(outstanding.status).toBe(200);
    const row = (outstanding.body.data as Array<{ supplierId: string; outstanding: string }>).find(
      (r) => r.supplierId === supplierId,
    );
    expect(row?.outstanding).toBe("50.00");

    const aging = await owner.agent.get("/api/v1/payables/aging");
    expect(aging.status).toBe(200);
    expect(aging.body.data.buckets.current.total).not.toBeUndefined();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
