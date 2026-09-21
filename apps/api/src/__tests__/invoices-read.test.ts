import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, registerAndOnboard } from "./customers-test-helpers.js";
import { createProduct, setStock } from "./sales-test-helpers.js";

const app = createApp();

async function createCashSale(owner: Awaited<ReturnType<typeof registerAndOnboard>>) {
  const product = await createProduct({ businessId: owner.businessId, sellingPrice: "15.00" });
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
    items: [{ productId: product.id, quantity: 2, unitPrice: 15 }],
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe("GET /api/v1/invoices", () => {
  it("lists invoices scoped to the tenant and filters by status", async () => {
    const owner = await registerAndOnboard(app, "InvoiceListA");
    const sale = await createCashSale(owner);

    const list = await owner.agent.get("/api/v1/invoices?status=PAID");
    expect(list.status).toBe(200);
    expect(list.body.data.map((inv: { id: string }) => inv.id)).toContain(sale.invoice.id);

    const wrongStatus = await owner.agent.get("/api/v1/invoices?status=DRAFT");
    expect(wrongStatus.body.data.map((inv: { id: string }) => inv.id)).not.toContain(sale.invoice.id);
  });

  it("gets a single invoice with its sale, items, and payments", async () => {
    const owner = await registerAndOnboard(app, "InvoiceGetA");
    const sale = await createCashSale(owner);

    const get = await owner.agent.get(`/api/v1/invoices/${sale.invoice.id}`);
    expect(get.status).toBe(200);
    expect(get.body.data.sale.id).toBe(sale.id);
    expect(get.body.data.sale.items).toHaveLength(1);
    expect(get.body.data.payments).toHaveLength(1);
  });

  it("returns a printable receipt payload", async () => {
    const owner = await registerAndOnboard(app, "InvoiceReceiptA");
    const sale = await createCashSale(owner);

    const receipt = await owner.agent.get(`/api/v1/invoices/${sale.invoice.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.business.id).toBe(owner.businessId);
    expect(receipt.body.data.invoice.id).toBe(sale.invoice.id);
    expect(receipt.body.data.sale.items).toHaveLength(1);
    expect(receipt.body.data.payments).toHaveLength(1);
  });
});

describe("Tenant isolation on invoice reads", () => {
  it("returns 404 for a cross-tenant invoice id, list, and receipt", async () => {
    const ownerA = await registerAndOnboard(app, "InvoiceIsoA");
    const ownerB = await registerAndOnboard(app, "InvoiceIsoB");
    const sale = await createCashSale(ownerA);

    const get = await ownerB.agent.get(`/api/v1/invoices/${sale.invoice.id}`);
    expect(get.status).toBe(404);

    const receipt = await ownerB.agent.get(`/api/v1/invoices/${sale.invoice.id}/receipt`);
    expect(receipt.status).toBe(404);

    const list = await ownerB.agent.get("/api/v1/invoices");
    expect(list.body.data.map((inv: { id: string }) => inv.id)).not.toContain(sale.invoice.id);
  });
});

describe("Permission enforcement on invoices", () => {
  it("returns 403 without sales.read", async () => {
    const owner = await registerAndOnboard(app, "InvoicePermA");
    await createCashSale(owner);
    const limited = await createLimitedMember(app, owner, "InvoicePermMember", ["customers.read"]);

    const attempt = await limited.agent.get("/api/v1/invoices");
    expect(attempt.status).toBe(403);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
