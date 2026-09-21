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
    email,
    userId: register.body.data.user.id as string,
    businessId: onboard.body.data.business.id as string,
    branchId: onboard.body.data.branch.id as string,
    warehouseId: onboard.body.data.warehouse.id as string,
  };
}

describe("inventory catalog: units", () => {
  it("supports full CRUD", async () => {
    const tenant = await registerAndOnboard("UnitCrud");

    const create = await tenant.agent.post("/api/v1/units").send({ name: "Kilogram", symbol: "kg" });
    expect(create.status).toBe(201);
    const unitId = create.body.data.id as string;

    const list = await tenant.agent.get("/api/v1/units");
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).some((u) => u.id === unitId)).toBe(true);

    const get = await tenant.agent.get(`/api/v1/units/${unitId}`);
    expect(get.status).toBe(200);
    expect(get.body.data.symbol).toBe("kg");

    const update = await tenant.agent.patch(`/api/v1/units/${unitId}`).send({ name: "Kilograms" });
    expect(update.status).toBe(200);
    expect(update.body.data.name).toBe("Kilograms");

    const del = await tenant.agent.delete(`/api/v1/units/${unitId}`);
    expect(del.status).toBe(200);

    const afterDelete = await tenant.agent.get(`/api/v1/units/${unitId}`);
    expect(afterDelete.status).toBe(404);
  });

  it("rejects deleting a unit still referenced by a product", async () => {
    const tenant = await registerAndOnboard("UnitInUse");
    const unit = await tenant.agent.post("/api/v1/units").send({ name: "Piece", symbol: "pc" });
    const product = await tenant.agent.post("/api/v1/products").send({
      unitId: unit.body.data.id,
      name: "Widget",
      sku: "WID-1",
      sellingPrice: 10,
    });
    expect(product.status).toBe(201);

    const del = await tenant.agent.delete(`/api/v1/units/${unit.body.data.id}`);
    expect(del.status).toBe(409);
  });
});

describe("inventory catalog: categories", () => {
  it("supports full CRUD", async () => {
    const tenant = await registerAndOnboard("CategoryCrud");

    const create = await tenant.agent.post("/api/v1/categories").send({ name: "Beverages" });
    expect(create.status).toBe(201);
    const categoryId = create.body.data.id as string;

    const list = await tenant.agent.get("/api/v1/categories");
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).some((c) => c.id === categoryId)).toBe(true);

    const update = await tenant.agent.patch(`/api/v1/categories/${categoryId}`).send({ description: "Drinks" });
    expect(update.status).toBe(200);
    expect(update.body.data.description).toBe("Drinks");

    const del = await tenant.agent.delete(`/api/v1/categories/${categoryId}`);
    expect(del.status).toBe(200);
  });

  it("prevents a category from becoming its own ancestor", async () => {
    const tenant = await registerAndOnboard("CategoryCycle");

    const parent = await tenant.agent.post("/api/v1/categories").send({ name: "Parent" });
    const child = await tenant.agent
      .post("/api/v1/categories")
      .send({ name: "Child", parentId: parent.body.data.id });
    expect(child.status).toBe(201);

    const grandchild = await tenant.agent
      .post("/api/v1/categories")
      .send({ name: "Grandchild", parentId: child.body.data.id });
    expect(grandchild.status).toBe(201);

    // Direct self-parent
    const selfCycle = await tenant.agent
      .patch(`/api/v1/categories/${parent.body.data.id}`)
      .send({ parentId: parent.body.data.id });
    expect(selfCycle.status).toBe(400);

    // Indirect cycle: parent -> grandchild would make parent its own ancestor
    const indirectCycle = await tenant.agent
      .patch(`/api/v1/categories/${parent.body.data.id}`)
      .send({ parentId: grandchild.body.data.id });
    expect(indirectCycle.status).toBe(400);
  });

  it("rejects deleting a category that still has children or products", async () => {
    const tenant = await registerAndOnboard("CategoryInUse");
    const parent = await tenant.agent.post("/api/v1/categories").send({ name: "Root" });
    await tenant.agent.post("/api/v1/categories").send({ name: "Leaf", parentId: parent.body.data.id });

    const del = await tenant.agent.delete(`/api/v1/categories/${parent.body.data.id}`);
    expect(del.status).toBe(409);
  });
});

describe("inventory catalog: products", () => {
  it("supports full CRUD and archives on delete", async () => {
    const tenant = await registerAndOnboard("ProductCrud");

    const create = await tenant.agent.post("/api/v1/products").send({
      name: "Coca Cola 500ml",
      sku: "COKE-500",
      barcode: "1234567890",
      sellingPrice: 1.5,
      costPrice: 1,
    });
    expect(create.status).toBe(201);
    const productId = create.body.data.id as string;
    expect(create.body.data.sellingPrice).toBe("1.5");

    const get = await tenant.agent.get(`/api/v1/products/${productId}`);
    expect(get.status).toBe(200);

    const update = await tenant.agent.patch(`/api/v1/products/${productId}`).send({ sellingPrice: 1.75 });
    expect(update.status).toBe(200);
    expect(update.body.data.sellingPrice).toBe("1.75");

    const del = await tenant.agent.delete(`/api/v1/products/${productId}`);
    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe("ARCHIVED");
  });

  it("rejects duplicate SKUs within the same business", async () => {
    const tenant = await registerAndOnboard("ProductDupSku");
    await tenant.agent.post("/api/v1/products").send({ name: "A", sku: "DUP-1", sellingPrice: 5 });
    const dupe = await tenant.agent.post("/api/v1/products").send({ name: "B", sku: "DUP-1", sellingPrice: 6 });
    expect(dupe.status).toBe(409);
  });

  it("searches by name/sku/barcode, filters by category, and paginates", async () => {
    const tenant = await registerAndOnboard("ProductSearch");
    const category = await tenant.agent.post("/api/v1/categories").send({ name: "Snacks" });
    const categoryId = category.body.data.id as string;

    await tenant.agent.post("/api/v1/products").send({
      name: "Potato Chips",
      sku: "CHIP-1",
      barcode: "555000111",
      sellingPrice: 2,
      categoryId,
    });
    await tenant.agent.post("/api/v1/products").send({
      name: "Chocolate Bar",
      sku: "CHOC-1",
      sellingPrice: 3,
    });
    await tenant.agent.post("/api/v1/products").send({
      name: "Extra",
      sku: "EXTRA-1",
      sellingPrice: 4,
    });

    const byName = await tenant.agent.get("/api/v1/products").query({ search: "chips" });
    expect(byName.status).toBe(200);
    expect((byName.body.data as Array<{ sku: string }>).map((p) => p.sku)).toContain("CHIP-1");

    const byBarcode = await tenant.agent.get("/api/v1/products").query({ search: "555000111" });
    expect((byBarcode.body.data as Array<{ sku: string }>).map((p) => p.sku)).toContain("CHIP-1");

    const byCategory = await tenant.agent.get("/api/v1/products").query({ categoryId });
    expect((byCategory.body.data as Array<{ sku: string }>).map((p) => p.sku)).toEqual(["CHIP-1"]);

    const paged = await tenant.agent.get("/api/v1/products").query({ page: 1, pageSize: 2 });
    expect(paged.status).toBe(200);
    expect(paged.body.data.length).toBe(2);
    expect(paged.body.meta.total).toBe(3);
    expect(paged.body.meta.totalPages).toBe(2);
  });

  it("supports nested product variant CRUD", async () => {
    const tenant = await registerAndOnboard("VariantCrud");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "T-Shirt",
      sku: "SHIRT-1",
      sellingPrice: 15,
      hasVariants: true,
    });
    const productId = product.body.data.id as string;

    const create = await tenant.agent.post(`/api/v1/products/${productId}/variants`).send({
      name: "Medium / Blue",
      sku: "SHIRT-1-M-BLUE",
      sellingPrice: 15,
      attributes: { size: "M", color: "blue" },
    });
    expect(create.status).toBe(201);
    const variantId = create.body.data.id as string;

    const list = await tenant.agent.get(`/api/v1/products/${productId}/variants`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);

    const update = await tenant.agent
      .patch(`/api/v1/products/${productId}/variants/${variantId}`)
      .send({ sellingPrice: 16 });
    expect(update.status).toBe(200);
    expect(update.body.data.sellingPrice).toBe("16");

    const del = await tenant.agent.delete(`/api/v1/products/${productId}/variants/${variantId}`);
    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe("ARCHIVED");
  });
});

describe("inventory catalog: batches", () => {
  it("creates and lists batches with expiry tracking", async () => {
    const tenant = await registerAndOnboard("BatchCrud");
    const product = await tenant.agent.post("/api/v1/products").send({
      name: "Milk",
      sku: "MILK-1",
      sellingPrice: 2,
    });
    const productId = product.body.data.id as string;

    const create = await tenant.agent.post("/api/v1/batches").send({
      warehouseId: tenant.warehouseId,
      productId,
      batchNumber: "B-001",
      expiryDate: "2030-01-01",
      quantity: 50,
    });
    expect(create.status).toBe(201);
    expect(create.body.data.quantity).toBe("50");
    expect(create.body.data.expiryDate).toBeTruthy();

    const list = await tenant.agent.get("/api/v1/batches").query({ productId });
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
