import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, createProductFixture, registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

describe("Purchases/expenses tenant isolation (deep)", () => {
  it("prevents Business B from reading Business A's purchase", async () => {
    const tenantA = await registerAndOnboard(app, "IsoPurchaseReadA");
    const tenantB = await registerAndOnboard(app, "IsoPurchaseReadB");
    const supplier = await tenantA.agent.post("/api/v1/suppliers").send({ name: "Iso Purchase Supplier" });
    const product = await createProductFixture({ businessId: tenantA.businessId });

    const receive = await tenantA.agent.post("/api/v1/purchases").send({
      supplierId: supplier.body.data.id,
      warehouseId: tenantA.warehouseId,
      items: [{ productId: product.id, quantity: 1, unitCost: 1 }],
    });
    const purchaseId = receive.body.data.id as string;

    const leak = await tenantB.agent.get(`/api/v1/purchases/${purchaseId}`);
    expect(leak.status).toBe(404);

    const listB = await tenantB.agent.get("/api/v1/purchases");
    expect(listB.status).toBe(200);
    expect((listB.body.data as Array<{ id: string }>).map((p) => p.id)).not.toContain(purchaseId);
  });

  it("prevents Business B from reading Business A's supplier payment", async () => {
    const tenantA = await registerAndOnboard(app, "IsoPaymentReadA");
    const tenantB = await registerAndOnboard(app, "IsoPaymentReadB");
    const supplier = await tenantA.agent.post("/api/v1/suppliers").send({ name: "Iso Payment Supplier" });
    const product = await createProductFixture({ businessId: tenantA.businessId });

    const receive = await tenantA.agent.post("/api/v1/purchases").send({
      supplierId: supplier.body.data.id,
      warehouseId: tenantA.warehouseId,
      items: [{ productId: product.id, quantity: 1, unitCost: 10 }],
    });

    await tenantA.agent.post(`/api/v1/suppliers/${supplier.body.data.id}/payments`).send({
      purchaseId: receive.body.data.id,
      amount: 5,
      method: "CASH",
    });

    const leak = await tenantB.agent.get(`/api/v1/suppliers/${supplier.body.data.id}/payments`);
    expect(leak.status).toBe(404); // supplier itself is not resolvable for Business B
  });

  it("prevents Business B from reading Business A's expense category and expense", async () => {
    const tenantA = await registerAndOnboard(app, "IsoExpenseReadA");
    const tenantB = await registerAndOnboard(app, "IsoExpenseReadB");

    const category = await tenantA.agent.post("/api/v1/expense-categories").send({ name: "Rent" });
    expect(category.status).toBe(201);
    const categoryId = category.body.data.id as string;

    const expense = await tenantA.agent.post("/api/v1/expenses").send({
      categoryId,
      amount: 100,
      description: "Office rent",
    });
    expect(expense.status).toBe(201);
    const expenseId = expense.body.data.id as string;

    const leakCategory = await tenantB.agent.get(`/api/v1/expense-categories/${categoryId}`);
    expect(leakCategory.status).toBe(404);

    const leakExpense = await tenantB.agent.get(`/api/v1/expenses/${expenseId}`);
    expect(leakExpense.status).toBe(404);

    const listB = await tenantB.agent.get("/api/v1/expenses");
    expect((listB.body.data as Array<{ id: string }>).map((e) => e.id)).not.toContain(expenseId);
  });

  it("rejects an expense referencing another business's expense category with 404", async () => {
    const tenantA = await registerAndOnboard(app, "IsoExpenseCrossFkA");
    const tenantB = await registerAndOnboard(app, "IsoExpenseCrossFkB");
    const categoryB = await tenantB.agent.post("/api/v1/expense-categories").send({ name: "Tenant B Category" });

    const attempt = await tenantA.agent.post("/api/v1/expenses").send({
      categoryId: categoryB.body.data.id,
      amount: 50,
      description: "Cross tenant attempt",
    });
    expect(attempt.status).toBe(404);
  });

  it("rejects an expense referencing another business's branchId with 404", async () => {
    const tenantA = await registerAndOnboard(app, "IsoExpenseBranchFkA");
    const tenantB = await registerAndOnboard(app, "IsoExpenseBranchFkB");
    const category = await tenantA.agent.post("/api/v1/expense-categories").send({ name: "Utilities" });

    const attempt = await tenantA.agent.post("/api/v1/expenses").send({
      categoryId: category.body.data.id,
      branchId: tenantB.branchId,
      amount: 50,
      description: "Cross tenant branch attempt",
    });
    expect(attempt.status).toBe(404);
  });

  describe("Permission enforcement", () => {
    it("returns 403 without purchases.read for GET /purchases", async () => {
      const owner = await registerAndOnboard(app, "PermPurchasesReadA");
      const limited = await createLimitedMember(app, owner, "PermPurchasesReadMember", ["expenses.read"]);
      const attempt = await limited.agent.get("/api/v1/purchases");
      expect(attempt.status).toBe(403);
    });

    it("returns 403 without purchases.create for POST /purchases", async () => {
      const owner = await registerAndOnboard(app, "PermPurchasesCreateA");
      const limited = await createLimitedMember(app, owner, "PermPurchasesCreateMember", ["purchases.read"]);
      const supplier = await owner.agent.post("/api/v1/suppliers").send({ name: "Perm Purchases Supplier" });
      const product = await createProductFixture({ businessId: owner.businessId });

      const attempt = await limited.agent.post("/api/v1/purchases").send({
        supplierId: supplier.body.data.id,
        warehouseId: owner.warehouseId,
        items: [{ productId: product.id, quantity: 1, unitCost: 1 }],
      });
      expect(attempt.status).toBe(403);
    });

    it("returns 403 without expenses.read for GET /expenses", async () => {
      const owner = await registerAndOnboard(app, "PermExpensesReadA");
      const limited = await createLimitedMember(app, owner, "PermExpensesReadMember", ["purchases.read"]);
      const attempt = await limited.agent.get("/api/v1/expenses");
      expect(attempt.status).toBe(403);
    });

    it("returns 403 without expenses.create for POST /expenses", async () => {
      const owner = await registerAndOnboard(app, "PermExpensesCreateA");
      const limited = await createLimitedMember(app, owner, "PermExpensesCreateMember", ["expenses.read"]);
      const category = await owner.agent.post("/api/v1/expense-categories").send({ name: "Perm Category" });

      const attempt = await limited.agent.post("/api/v1/expenses").send({
        categoryId: category.body.data.id,
        amount: 10,
        description: "Blocked",
      });
      expect(attempt.status).toBe(403);
    });

    it("returns 403 without purchases.read for GET /payables/outstanding", async () => {
      const owner = await registerAndOnboard(app, "PermPayablesReadA");
      const limited = await createLimitedMember(app, owner, "PermPayablesReadMember", ["expenses.read"]);
      const attempt = await limited.agent.get("/api/v1/payables/outstanding");
      expect(attempt.status).toBe(403);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
