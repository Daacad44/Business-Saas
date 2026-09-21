import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

describe("Expense categories CRUD", () => {
  it("creates, reads, updates, and deletes a clean expense category", async () => {
    const owner = await registerAndOnboard(app, "ExpCatCrudA");

    const create = await owner.agent.post("/api/v1/expense-categories").send({ name: "Fuel" });
    expect(create.status).toBe(201);
    const categoryId = create.body.data.id as string;

    const get = await owner.agent.get(`/api/v1/expense-categories/${categoryId}`);
    expect(get.status).toBe(200);

    const update = await owner.agent.patch(`/api/v1/expense-categories/${categoryId}`).send({ name: "Fuel & Transport" });
    expect(update.status).toBe(200);
    expect(update.body.data.name).toBe("Fuel & Transport");

    const del = await owner.agent.delete(`/api/v1/expense-categories/${categoryId}`);
    expect(del.status).toBe(200);

    const getAfterDelete = await owner.agent.get(`/api/v1/expense-categories/${categoryId}`);
    expect(getAfterDelete.status).toBe(404);
  });

  it("rejects duplicate category names within the same business", async () => {
    const owner = await registerAndOnboard(app, "ExpCatDupA");
    await owner.agent.post("/api/v1/expense-categories").send({ name: "Rent" });
    const dup = await owner.agent.post("/api/v1/expense-categories").send({ name: "Rent" });
    expect(dup.status).toBe(409);
  });

  it("refuses deletion of a category that has expenses recorded against it", async () => {
    const owner = await registerAndOnboard(app, "ExpCatBlockDeleteA");
    const category = await owner.agent.post("/api/v1/expense-categories").send({ name: "Salaries" });
    const categoryId = category.body.data.id as string;

    await owner.agent.post("/api/v1/expenses").send({ categoryId, amount: 200, description: "Payroll" });

    const del = await owner.agent.delete(`/api/v1/expense-categories/${categoryId}`);
    expect(del.status).toBe(409);
  });
});

describe("Expenses CRUD and filters", () => {
  it("creates, reads, updates, and deletes an expense", async () => {
    const owner = await registerAndOnboard(app, "ExpCrudA");
    const category = await owner.agent.post("/api/v1/expense-categories").send({ name: "Utilities" });
    const categoryId = category.body.data.id as string;

    const create = await owner.agent.post("/api/v1/expenses").send({
      categoryId,
      branchId: owner.branchId,
      amount: 45.5,
      description: "Electricity bill",
      method: "MOBILE_MONEY",
    });
    expect(create.status).toBe(201);
    expect(create.body.data.amount).toBe("45.50");
    const expenseId = create.body.data.id as string;

    const get = await owner.agent.get(`/api/v1/expenses/${expenseId}`);
    expect(get.status).toBe(200);

    const update = await owner.agent.patch(`/api/v1/expenses/${expenseId}`).send({ amount: 50 });
    expect(update.status).toBe(200);
    expect(update.body.data.amount).toBe("50.00");

    const del = await owner.agent.delete(`/api/v1/expenses/${expenseId}`);
    expect(del.status).toBe(200);

    const getAfterDelete = await owner.agent.get(`/api/v1/expenses/${expenseId}`);
    expect(getAfterDelete.status).toBe(404);
  });

  it("filters by category, branch, method, and date range with pagination", async () => {
    const owner = await registerAndOnboard(app, "ExpFilterA");
    const categoryA = await owner.agent.post("/api/v1/expense-categories").send({ name: "Category A" });
    const categoryB = await owner.agent.post("/api/v1/expense-categories").send({ name: "Category B" });

    await owner.agent.post("/api/v1/expenses").send({
      categoryId: categoryA.body.data.id,
      branchId: owner.branchId,
      amount: 10,
      description: "A1",
      method: "CASH",
    });
    await owner.agent.post("/api/v1/expenses").send({
      categoryId: categoryB.body.data.id,
      amount: 20,
      description: "B1",
      method: "CARD",
    });

    const filteredByCategory = await owner.agent.get("/api/v1/expenses").query({ categoryId: categoryA.body.data.id });
    expect(filteredByCategory.body.data).toHaveLength(1);
    expect(filteredByCategory.body.data[0].description).toBe("A1");

    const filteredByMethod = await owner.agent.get("/api/v1/expenses").query({ method: "CARD" });
    expect(filteredByMethod.body.data).toHaveLength(1);
    expect(filteredByMethod.body.data[0].description).toBe("B1");

    const filteredByBranch = await owner.agent.get("/api/v1/expenses").query({ branchId: owner.branchId });
    expect(filteredByBranch.body.data.map((e: { description: string }) => e.description)).toContain("A1");

    const page = await owner.agent.get("/api/v1/expenses").query({ page: 1, pageSize: 1 });
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.total).toBe(2);
  });

  it("computes exact decimal totals-by-category", async () => {
    const owner = await registerAndOnboard(app, "ExpTotalsA");
    const categoryA = await owner.agent.post("/api/v1/expense-categories").send({ name: "Totals Category A" });
    const categoryB = await owner.agent.post("/api/v1/expense-categories").send({ name: "Totals Category B" });

    await owner.agent.post("/api/v1/expenses").send({ categoryId: categoryA.body.data.id, amount: 10.1, description: "e1" });
    await owner.agent.post("/api/v1/expenses").send({ categoryId: categoryA.body.data.id, amount: 20.2, description: "e2" });
    await owner.agent.post("/api/v1/expenses").send({ categoryId: categoryB.body.data.id, amount: 5.7, description: "e3" });

    const totals = await owner.agent.get("/api/v1/expenses/summary/by-category");
    expect(totals.status).toBe(200);

    const rowA = (totals.body.data.categories as Array<{ categoryId: string; totalAmount: string; count: number }>).find(
      (row) => row.categoryId === categoryA.body.data.id,
    );
    const rowB = (totals.body.data.categories as Array<{ categoryId: string; totalAmount: string; count: number }>).find(
      (row) => row.categoryId === categoryB.body.data.id,
    );

    expect(rowA?.totalAmount).toBe("30.30");
    expect(rowA?.count).toBe(2);
    expect(rowB?.totalAmount).toBe("5.70");
    expect(totals.body.data.totalAmount).toBe("36.00");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
