import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, registerAndOnboard } from "./purchases-test-helpers.js";

const app = createApp();

describe("Suppliers CRUD", () => {
  it("creates, reads, and updates a supplier", async () => {
    const owner = await registerAndOnboard(app, "SupCrudA");

    const create = await owner.agent.post("/api/v1/suppliers").send({
      name: "Berbera Traders",
      phone: "+252611000222",
      email: "berbera@example.com",
      contactPerson: "Ali",
    });
    expect(create.status).toBe(201);
    expect(create.body.data.name).toBe("Berbera Traders");
    expect(create.body.data.currentBalance).toBe("0.00");
    const supplierId = create.body.data.id as string;

    const get = await owner.agent.get(`/api/v1/suppliers/${supplierId}`);
    expect(get.status).toBe(200);
    expect(get.body.data.phone).toBe("+252611000222");

    const update = await owner.agent.patch(`/api/v1/suppliers/${supplierId}`).send({
      name: "Berbera Traders Ltd",
    });
    expect(update.status).toBe(200);
    expect(update.body.data.name).toBe("Berbera Traders Ltd");
  });

  it("searches and paginates suppliers", async () => {
    const owner = await registerAndOnboard(app, "SupCrudSearch");
    for (let i = 0; i < 5; i += 1) {
      const res = await owner.agent.post("/api/v1/suppliers").send({
        name: i === 2 ? "Findable Supplier" : `Supplier Number ${i}`,
      });
      expect(res.status).toBe(201);
    }

    const search = await owner.agent.get("/api/v1/suppliers").query({ search: "Findable" });
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].name).toBe("Findable Supplier");

    const page1 = await owner.agent.get("/api/v1/suppliers").query({ page: 1, pageSize: 2 });
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.total).toBe(5);
    expect(page1.body.meta.totalPages).toBe(3);
  });

  it("filters suppliers by status", async () => {
    const owner = await registerAndOnboard(app, "SupCrudStatus");
    const create = await owner.agent.post("/api/v1/suppliers").send({ name: "Archivable Supplier" });
    const supplierId = create.body.data.id as string;
    await owner.agent.delete(`/api/v1/suppliers/${supplierId}`);

    const active = await owner.agent.get("/api/v1/suppliers").query({ status: "ACTIVE" });
    const archived = await owner.agent.get("/api/v1/suppliers").query({ status: "ARCHIVED" });

    expect(active.body.data.map((s: { id: string }) => s.id)).not.toContain(supplierId);
    expect(archived.body.data.map((s: { id: string }) => s.id)).toContain(supplierId);
  });

  it("disables a clean supplier with no purchase history", async () => {
    const owner = await registerAndOnboard(app, "SupCrudDisableClean");
    const create = await owner.agent.post("/api/v1/suppliers").send({ name: "Clean Supplier" });
    const supplierId = create.body.data.id as string;

    const disable = await owner.agent.delete(`/api/v1/suppliers/${supplierId}`);
    expect(disable.status).toBe(200);
    expect(disable.body.data.status).toBe("ARCHIVED");
  });

  it("refuses deletion when the supplier has purchase history", async () => {
    const owner = await registerAndOnboard(app, "SupCrudDisableHistory");
    const create = await owner.agent.post("/api/v1/suppliers").send({ name: "History Supplier" });
    const supplierId = create.body.data.id as string;

    await prisma.purchase.create({
      data: {
        businessId: owner.businessId,
        supplierId,
        warehouseId: owner.warehouseId,
        purchaseNumber: `PUR-HISTORY-${Date.now()}`,
        status: "COMPLETED",
        subtotal: "10.00",
        totalAmount: "10.00",
        amountPaid: "10.00",
        amountDue: "0.00",
      },
    });

    const disable = await owner.agent.delete(`/api/v1/suppliers/${supplierId}`);
    expect(disable.status).toBe(409);
    expect(disable.body.error.code).toBe("CONFLICT");
  });

  it("refuses deletion when the supplier has an outstanding payable", async () => {
    const owner = await registerAndOnboard(app, "SupCrudDisableBalance");
    const create = await owner.agent.post("/api/v1/suppliers").send({ name: "Balance Supplier" });
    const supplierId = create.body.data.id as string;

    await prisma.supplier.update({ where: { id: supplierId }, data: { currentBalance: "25.00" } });

    const disable = await owner.agent.delete(`/api/v1/suppliers/${supplierId}`);
    expect(disable.status).toBe(409);
    expect(disable.body.error.code).toBe("CONFLICT");
  });

  it("enforces the purchases.create permission for supplier writes", async () => {
    const owner = await registerAndOnboard(app, "SupPermCreate");
    const limited = await createLimitedMember(app, owner, "SupPermCreateMember", ["purchases.read"]);

    const attempt = await limited.agent.post("/api/v1/suppliers").send({ name: "Blocked" });
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe("FORBIDDEN");
  });

  it("enforces the purchases.read permission for supplier reads", async () => {
    const owner = await registerAndOnboard(app, "SupPermRead");
    const limited = await createLimitedMember(app, owner, "SupPermReadMember", ["expenses.read"]);

    const attempt = await limited.agent.get("/api/v1/suppliers");
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe("FORBIDDEN");
  });

  describe("Tenant isolation", () => {
    it("prevents Business B from reading Business A's supplier", async () => {
      const tenantA = await registerAndOnboard(app, "SupIsoReadA");
      const tenantB = await registerAndOnboard(app, "SupIsoReadB");
      const create = await tenantA.agent.post("/api/v1/suppliers").send({ name: "Tenant A Supplier" });
      const supplierId = create.body.data.id as string;

      const leak = await tenantB.agent.get(`/api/v1/suppliers/${supplierId}`);
      expect(leak.status).toBe(404);
      expect(leak.body.error.code).toBe("NOT_FOUND");
    });

    it("prevents Business B from updating or deleting Business A's supplier", async () => {
      const tenantA = await registerAndOnboard(app, "SupIsoWriteA");
      const tenantB = await registerAndOnboard(app, "SupIsoWriteB");
      const create = await tenantA.agent.post("/api/v1/suppliers").send({ name: "Tenant A Supplier 2" });
      const supplierId = create.body.data.id as string;

      const patchLeak = await tenantB.agent.patch(`/api/v1/suppliers/${supplierId}`).send({ name: "Hacked" });
      expect(patchLeak.status).toBe(404);

      const deleteLeak = await tenantB.agent.delete(`/api/v1/suppliers/${supplierId}`);
      expect(deleteLeak.status).toBe(404);

      const stillA = await tenantA.agent.get(`/api/v1/suppliers/${supplierId}`);
      expect(stillA.body.data.name).toBe("Tenant A Supplier 2");
    });

    it("does not leak Business A's suppliers into Business B's list", async () => {
      const tenantA = await registerAndOnboard(app, "SupIsoListA");
      const tenantB = await registerAndOnboard(app, "SupIsoListB");
      await tenantA.agent.post("/api/v1/suppliers").send({ name: "Only In A" });

      const listB = await tenantB.agent.get("/api/v1/suppliers");
      expect(listB.status).toBe(200);
      const namesB = (listB.body.data as Array<{ name: string }>).map((s) => s.name);
      expect(namesB).not.toContain("Only In A");
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
