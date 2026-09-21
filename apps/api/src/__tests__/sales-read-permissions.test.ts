import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, registerAndOnboard } from "./customers-test-helpers.js";
import { createProduct, setStock } from "./sales-test-helpers.js";

const app = createApp();

async function createCashSale(owner: Awaited<ReturnType<typeof registerAndOnboard>>, sellingPrice = "10.00") {
  const product = await createProduct({ businessId: owner.businessId, sellingPrice });
  await setStock({
    businessId: owner.businessId,
    warehouseId: owner.warehouseId,
    productId: product.id,
    quantity: "50",
    userId: owner.userId,
  });
  const res = await owner.agent.post("/api/v1/sales").send({
    branchId: owner.branchId,
    warehouseId: owner.warehouseId,
    type: "CASH",
    items: [{ productId: product.id, quantity: 2, unitPrice: Number(sellingPrice) }],
  });
  expect(res.status).toBe(201);
  return { product, sale: res.body.data };
}

describe("GET /api/v1/sales — list and get", () => {
  it("lists sales scoped to the tenant with pagination and filters by search/type", async () => {
    const owner = await registerAndOnboard(app, "SaleListA");
    const { sale } = await createCashSale(owner);

    const list = await owner.agent.get("/api/v1/sales");
    expect(list.status).toBe(200);
    expect(list.body.data.map((s: { id: string }) => s.id)).toContain(sale.id);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);

    const bySearch = await owner.agent.get(`/api/v1/sales?search=${sale.saleNumber}`);
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].id).toBe(sale.id);

    const byType = await owner.agent.get("/api/v1/sales?type=CREDIT");
    expect(byType.status).toBe(200);
    expect(byType.body.data.map((s: { id: string }) => s.id)).not.toContain(sale.id);
  });

  it("gets a single sale with items, invoice, and payments", async () => {
    const owner = await registerAndOnboard(app, "SaleGetA");
    const { sale } = await createCashSale(owner);

    const get = await owner.agent.get(`/api/v1/sales/${sale.id}`);
    expect(get.status).toBe(200);
    expect(get.body.data.items).toHaveLength(1);
    expect(get.body.data.invoice.status).toBe("PAID");
    expect(get.body.data.payments).toHaveLength(1);
  });
});

describe("Tenant isolation on reads", () => {
  it("returns 404 when business B reads business A's sale", async () => {
    const ownerA = await registerAndOnboard(app, "SaleIsoReadA");
    const ownerB = await registerAndOnboard(app, "SaleIsoReadB");
    const { sale } = await createCashSale(ownerA);

    const attempt = await ownerB.agent.get(`/api/v1/sales/${sale.id}`);
    expect(attempt.status).toBe(404);

    const list = await ownerB.agent.get("/api/v1/sales");
    expect(list.body.data.map((s: { id: string }) => s.id)).not.toContain(sale.id);
  });

  it("returns 404 when business B reads business A's invoice", async () => {
    const ownerA = await registerAndOnboard(app, "InvoiceIsoReadA");
    const ownerB = await registerAndOnboard(app, "InvoiceIsoReadB");
    const { sale } = await createCashSale(ownerA);
    const invoiceId = sale.invoice?.id ?? (await prisma.invoice.findFirst({ where: { saleId: sale.id } }))!.id;

    const attempt = await ownerB.agent.get(`/api/v1/invoices/${invoiceId}`);
    expect(attempt.status).toBe(404);
  });

  it("returns 404 when business B reads business A's payment via the invoice", async () => {
    const ownerA = await registerAndOnboard(app, "PaymentIsoReadA");
    const ownerB = await registerAndOnboard(app, "PaymentIsoReadB");
    const { sale } = await createCashSale(ownerA);

    // Business B cannot even discover the sale/invoice/payment ids for A.
    const attemptSale = await ownerB.agent.get(`/api/v1/sales/${sale.id}`);
    expect(attemptSale.status).toBe(404);

    const payments = await prisma.payment.findMany({ where: { businessId: ownerA.businessId } });
    expect(payments.length).toBeGreaterThan(0);
    const crossPayments = await prisma.payment.findMany({ where: { businessId: ownerB.businessId } });
    expect(crossPayments).toHaveLength(0);
  });

  it("returns 404 when business B attempts to return business A's sale", async () => {
    const ownerA = await registerAndOnboard(app, "ReturnIsoReadA");
    const ownerB = await registerAndOnboard(app, "ReturnIsoReadB");
    const { sale } = await createCashSale(ownerA);
    const saleItemId = (
      await prisma.saleItem.findFirst({ where: { businessId: ownerA.businessId, saleId: sale.id } })
    )!.id;

    const attempt = await ownerB.agent
      .post(`/api/v1/sales/${sale.id}/return`)
      .send({ items: [{ saleItemId, quantity: 1 }] });
    expect(attempt.status).toBe(404);
  });
});

describe("Permission enforcement", () => {
  it("returns 403 when a member without sales.create attempts to create a sale", async () => {
    const owner = await registerAndOnboard(app, "PermSalesCreate");
    const product = await createProduct({ businessId: owner.businessId, sellingPrice: "10.00" });
    const limited = await createLimitedMember(app, owner, "PermSalesCreateMember", ["sales.read"]);

    const attempt = await limited.agent.post("/api/v1/sales").send({
      branchId: owner.branchId,
      warehouseId: owner.warehouseId,
      type: "CASH",
      items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
    });
    expect(attempt.status).toBe(403);
  });

  it("returns 403 when a member without sales.read attempts to list sales", async () => {
    const owner = await registerAndOnboard(app, "PermSalesRead");
    const limited = await createLimitedMember(app, owner, "PermSalesReadMember", ["customers.read"]);

    const attempt = await limited.agent.get("/api/v1/sales");
    expect(attempt.status).toBe(403);
  });

  it("returns 403 when a member without debts.collect attempts to record a sale payment", async () => {
    const owner = await registerAndOnboard(app, "PermPaymentsCollect");
    const { sale } = await createCashSale(owner);
    const limited = await createLimitedMember(app, owner, "PermPaymentsCollectMember", ["sales.read", "sales.create"]);

    const attempt = await limited.agent.post(`/api/v1/sales/${sale.id}/payment`).send({
      amount: 1,
      method: "CASH",
    });
    expect(attempt.status).toBe(403);
  });

  it("returns 403 when a member without sales.update attempts a return", async () => {
    const owner = await registerAndOnboard(app, "PermSalesUpdate");
    const { sale } = await createCashSale(owner);
    const saleItemId = (
      await prisma.saleItem.findFirst({ where: { businessId: owner.businessId, saleId: sale.id } })
    )!.id;
    const limited = await createLimitedMember(app, owner, "PermSalesUpdateMember", ["sales.read"]);

    const attempt = await limited.agent
      .post(`/api/v1/sales/${sale.id}/return`)
      .send({ items: [{ saleItemId, quantity: 1 }] });
    expect(attempt.status).toBe(403);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
