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

async function createProduct(tenant: Awaited<ReturnType<typeof registerAndOnboard>>, sku: string) {
  const res = await tenant.agent.post("/api/v1/products").send({
    name: `Product ${sku}`,
    sku,
    sellingPrice: 10,
    costPrice: 5,
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function createSecondWarehouse(tenant: Awaited<ReturnType<typeof registerAndOnboard>>) {
  const res = await tenant.agent.post("/api/v1/warehouses").send({
    branchId: tenant.branchId,
    name: "Secondary warehouse",
    code: "WH2",
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

describe("stock adjustments", () => {
  it("creates exactly one movement per item and updates StockLevel to match the ledger sum", async () => {
    const tenant = await registerAndOnboard("AdjustLedger");
    const productId = await createProduct(tenant, "ADJ-1");

    const adjustment = await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 100, unitCost: 5 }],
    });
    expect(adjustment.status).toBe(201);
    expect(adjustment.body.data.items.length).toBe(1);
    const movementId = adjustment.body.data.items[0].movementId as string;
    expect(movementId).toBeTruthy();

    const movements = await tenant.agent.get("/api/v1/inventory/movements").query({ productId });
    expect(movements.status).toBe(200);
    expect(movements.body.data.length).toBe(1);
    expect(movements.body.data[0].id).toBe(movementId);
    expect(movements.body.data[0].type).toBe("ADJUSTMENT_IN");
    expect(movements.body.data[0].quantity).toBe("100");

    const levels = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: tenant.warehouseId });
    expect(levels.status).toBe(200);
    expect(levels.body.data.length).toBe(1);
    expect(levels.body.data[0].quantity).toBe("100");

    // A second adjustment (a decrease) must add a second, distinct movement,
    // and the resulting StockLevel must equal the ledger sum (100 - 30 = 70).
    const secondAdjustment = await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "DAMAGE",
      items: [{ productId, quantityDelta: -30 }],
    });
    expect(secondAdjustment.status).toBe(201);

    const allMovements = await tenant.agent.get("/api/v1/inventory/movements").query({ productId });
    expect(allMovements.body.data.length).toBe(2);
    const ledgerSum = (allMovements.body.data as Array<{ quantity: string }>).reduce(
      (sum, m) => sum + Number(m.quantity),
      0,
    );
    expect(ledgerSum).toBe(70);

    const levelAfter = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: tenant.warehouseId });
    expect(levelAfter.body.data[0].quantity).toBe("70");
  });

  it("rejects an adjustment that would drive stock negative", async () => {
    const tenant = await registerAndOnboard("AdjustNegative");
    const productId = await createProduct(tenant, "NEG-1");

    const seed = await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 10 }],
    });
    expect(seed.status).toBe(201);

    const overdraw = await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "DAMAGE",
      items: [{ productId, quantityDelta: -20 }],
    });
    expect(overdraw.status).toBe(409);

    // Stock level must remain unchanged after the rejected adjustment.
    const level = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: tenant.warehouseId });
    expect(level.body.data[0].quantity).toBe("10");

    // And no extra movement should have been written for the rejected attempt.
    const movements = await tenant.agent.get("/api/v1/inventory/movements").query({ productId });
    expect(movements.body.data.length).toBe(1);
  });

  it("rejects an adjustment against a warehouse from another business (404, not leaked)", async () => {
    const tenantA = await registerAndOnboard("AdjustCrossA");
    const tenantB = await registerAndOnboard("AdjustCrossB");
    const productB = await createProduct(tenantB, "CROSS-1");

    const attempt = await tenantA.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenantB.warehouseId,
      reason: "RECOUNT",
      items: [{ productId: productB, quantityDelta: 5 }],
    });
    expect(attempt.status).toBe(404);
  });
});

describe("stock transfers", () => {
  it("dispatch + receive produces exactly two movements and conserves total quantity", async () => {
    const tenant = await registerAndOnboard("TransferConserve");
    const productId = await createProduct(tenant, "XFER-1");
    const warehouseB = await createSecondWarehouse(tenant);

    await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 40 }],
    });

    const transfer = await tenant.agent.post("/api/v1/inventory/transfers").send({
      fromWarehouseId: tenant.warehouseId,
      toWarehouseId: warehouseB,
      items: [{ productId, quantity: 15 }],
    });
    expect(transfer.status).toBe(201);
    expect(transfer.body.data.status).toBe("IN_TRANSIT");
    const transferId = transfer.body.data.id as string;

    const fromLevelAfterDispatch = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: tenant.warehouseId });
    expect(fromLevelAfterDispatch.body.data[0].quantity).toBe("25");

    const receive = await tenant.agent.post(`/api/v1/inventory/transfers/${transferId}/receive`).send({});
    expect(receive.status).toBe(200);
    expect(receive.body.data.status).toBe("COMPLETED");

    const movements = await tenant.agent.get("/api/v1/inventory/movements").query({ referenceId: transferId });
    expect(movements.body.data.length).toBe(2);
    const types = (movements.body.data as Array<{ type: string; quantity: string }>).map((m) => m.type).sort();
    expect(types).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);

    const fromLevel = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: tenant.warehouseId });
    const toLevel = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: warehouseB });
    expect(fromLevel.body.data[0].quantity).toBe("25");
    expect(toLevel.body.data[0].quantity).toBe("15");

    const total = Number(fromLevel.body.data[0].quantity) + Number(toLevel.body.data[0].quantity);
    expect(total).toBe(40);
  });

  it("rejects double-receive of the same transfer (no duplicate movements)", async () => {
    const tenant = await registerAndOnboard("TransferDoubleReceive");
    const productId = await createProduct(tenant, "XFER-2");
    const warehouseB = await createSecondWarehouse(tenant);

    await tenant.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenant.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 20 }],
    });

    const transfer = await tenant.agent.post("/api/v1/inventory/transfers").send({
      fromWarehouseId: tenant.warehouseId,
      toWarehouseId: warehouseB,
      items: [{ productId, quantity: 5 }],
    });
    const transferId = transfer.body.data.id as string;

    const firstReceive = await tenant.agent.post(`/api/v1/inventory/transfers/${transferId}/receive`).send({});
    expect(firstReceive.status).toBe(200);

    const secondReceive = await tenant.agent.post(`/api/v1/inventory/transfers/${transferId}/receive`).send({});
    expect(secondReceive.status).toBe(409);

    const movements = await tenant.agent.get("/api/v1/inventory/movements").query({ referenceId: transferId });
    expect(movements.body.data.length).toBe(2);

    const toLevel = await tenant.agent
      .get("/api/v1/inventory/stock-levels")
      .query({ productId, warehouseId: warehouseB });
    expect(toLevel.body.data[0].quantity).toBe("5");
  });

  it("rejects dispatching more stock than is available", async () => {
    const tenant = await registerAndOnboard("TransferOverdraw");
    const productId = await createProduct(tenant, "XFER-3");
    const warehouseB = await createSecondWarehouse(tenant);

    const transfer = await tenant.agent.post("/api/v1/inventory/transfers").send({
      fromWarehouseId: tenant.warehouseId,
      toWarehouseId: warehouseB,
      items: [{ productId, quantity: 5 }],
    });
    expect(transfer.status).toBe(409);
  });
});

describe("inventory tenant isolation", () => {
  it("prevents Tenant B from reading Tenant A's product (404)", async () => {
    const tenantA = await registerAndOnboard("InvIsoProductA");
    const tenantB = await registerAndOnboard("InvIsoProductB");
    const productId = await createProduct(tenantA, "ISO-PRODUCT");

    const read = await tenantB.agent.get(`/api/v1/products/${productId}`);
    expect(read.status).toBe(404);

    const update = await tenantB.agent.patch(`/api/v1/products/${productId}`).send({ name: "Hacked" });
    expect(update.status).toBe(404);

    const del = await tenantB.agent.delete(`/api/v1/products/${productId}`);
    expect(del.status).toBe(404);
  });

  it("prevents Tenant B from reading Tenant A's category (404)", async () => {
    const tenantA = await registerAndOnboard("InvIsoCategoryA");
    const tenantB = await registerAndOnboard("InvIsoCategoryB");
    const category = await tenantA.agent.post("/api/v1/categories").send({ name: "Isolated" });
    const categoryId = category.body.data.id as string;

    const read = await tenantB.agent.get(`/api/v1/categories/${categoryId}`);
    expect(read.status).toBe(404);

    const update = await tenantB.agent.patch(`/api/v1/categories/${categoryId}`).send({ name: "Hacked" });
    expect(update.status).toBe(404);

    const del = await tenantB.agent.delete(`/api/v1/categories/${categoryId}`);
    expect(del.status).toBe(404);
  });

  it("excludes Tenant A's stock levels and movements from Tenant B's list responses", async () => {
    const tenantA = await registerAndOnboard("InvIsoStockA");
    const tenantB = await registerAndOnboard("InvIsoStockB");
    const productId = await createProduct(tenantA, "ISO-STOCK");

    const adjustment = await tenantA.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenantA.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 25 }],
    });
    expect(adjustment.status).toBe(201);

    const levelsB = await tenantB.agent.get("/api/v1/inventory/stock-levels");
    expect(levelsB.status).toBe(200);
    expect((levelsB.body.data as Array<{ productId: string }>).some((l) => l.productId === productId)).toBe(false);

    const movementsB = await tenantB.agent.get("/api/v1/inventory/movements");
    expect(movementsB.status).toBe(200);
    expect((movementsB.body.data as Array<{ productId: string }>).some((m) => m.productId === productId)).toBe(
      false,
    );

    const movementId = adjustment.body.data.items[0].movementId as string;
    const directRead = await tenantB.agent.get(`/api/v1/inventory/movements/${movementId}`);
    expect(directRead.status).toBe(404);
  });

  it("returns 404 (not 403) when Tenant B tries to adjust stock in Tenant A's warehouse", async () => {
    const tenantA = await registerAndOnboard("InvIsoAdjustA");
    const tenantB = await registerAndOnboard("InvIsoAdjustB");
    const productB = await createProduct(tenantB, "ISO-ADJUST-B");

    const attempt = await tenantB.agent.post("/api/v1/inventory/adjustments").send({
      warehouseId: tenantA.warehouseId,
      reason: "RECOUNT",
      items: [{ productId: productB, quantityDelta: 5 }],
    });
    expect(attempt.status).toBe(404);
  });
});

describe("inventory permission enforcement", () => {
  it("returns 403 for a member without inventory.* permissions", async () => {
    const owner = await registerAndOnboard("PermOwner");

    const role = await owner.agent.post("/api/v1/roles").send({
      name: "Sales Only",
      permissionKeys: ["sales.read"],
    });
    expect(role.status).toBe(201);
    const roleId = role.body.data.id as string;

    const memberEmail = uniqueEmail("PermMember");
    const invite = await owner.agent.post("/api/v1/users/invite").send({ email: memberEmail, roleId });
    expect(invite.status).toBe(201);
    const token = invite.body.data.token as string;

    const memberAgent = request.agent(app);
    const memberRegister = await memberAgent.post("/api/v1/auth/register").send({
      fullName: "Perm Member",
      email: memberEmail,
      password,
    });
    expect(memberRegister.status).toBe(201);

    const accept = await memberAgent.post("/api/v1/auth/invitations/accept").send({ token });
    expect(accept.status).toBe(200);

    const listProducts = await memberAgent.get("/api/v1/products");
    expect(listProducts.status).toBe(403);

    const createProductAttempt = await memberAgent
      .post("/api/v1/products")
      .send({ name: "Blocked", sku: "BLOCKED-1", sellingPrice: 1 });
    expect(createProductAttempt.status).toBe(403);

    const adjustAttempt = await memberAgent.post("/api/v1/inventory/adjustments").send({
      warehouseId: owner.warehouseId,
      reason: "RECOUNT",
      items: [{ productId: "does-not-matter", quantityDelta: 1 }],
    });
    expect(adjustAttempt.status).toBe(403);

    const transferAttempt = await memberAgent.post("/api/v1/inventory/transfers").send({
      fromWarehouseId: owner.warehouseId,
      toWarehouseId: owner.warehouseId,
      items: [{ productId: "does-not-matter", quantity: 1 }],
    });
    expect(transferAttempt.status).toBe(403);
  });

  it("allows a member with only inventory.read to view but not mutate", async () => {
    const owner = await registerAndOnboard("PermReadOnlyOwner");
    const productId = await createProduct(owner, "READ-ONLY-1");

    const role = await owner.agent.post("/api/v1/roles").send({
      name: "Inventory Viewer",
      permissionKeys: ["inventory.read"],
    });
    const roleId = role.body.data.id as string;

    const memberEmail = uniqueEmail("PermReadOnlyMember");
    const invite = await owner.agent.post("/api/v1/users/invite").send({ email: memberEmail, roleId });
    const token = invite.body.data.token as string;

    const memberAgent = request.agent(app);
    await memberAgent.post("/api/v1/auth/register").send({ fullName: "Read Only", email: memberEmail, password });
    await memberAgent.post("/api/v1/auth/invitations/accept").send({ token });

    const list = await memberAgent.get("/api/v1/products");
    expect(list.status).toBe(200);

    const create = await memberAgent
      .post("/api/v1/products")
      .send({ name: "Blocked", sku: "BLOCKED-2", sellingPrice: 1 });
    expect(create.status).toBe(403);

    const adjust = await memberAgent.post("/api/v1/inventory/adjustments").send({
      warehouseId: owner.warehouseId,
      reason: "RECOUNT",
      items: [{ productId, quantityDelta: 1 }],
    });
    expect(adjust.status).toBe(403);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
