import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createLimitedMember, registerAndOnboard } from "./customers-test-helpers.js";

const app = createApp();

describe("Customers CRUD", () => {
  it("creates, reads, updates a customer", async () => {
    const owner = await registerAndOnboard(app, "CustCrudA");

    const create = await owner.agent.post("/api/v1/customers").send({
      fullName: "Amina Hassan",
      phone: "+252611000111",
      email: "amina@example.com",
      creditLimit: 500,
    });
    expect(create.status).toBe(201);
    expect(create.body.data.fullName).toBe("Amina Hassan");
    expect(create.body.data.creditLimit).toBe("500.00");
    expect(create.body.data.currentBalance).toBe("0.00");
    const customerId = create.body.data.id as string;

    const get = await owner.agent.get(`/api/v1/customers/${customerId}`);
    expect(get.status).toBe(200);
    expect(get.body.data.phone).toBe("+252611000111");

    const update = await owner.agent.patch(`/api/v1/customers/${customerId}`).send({
      fullName: "Amina H. Warsame",
      creditLimit: 750,
    });
    expect(update.status).toBe(200);
    expect(update.body.data.fullName).toBe("Amina H. Warsame");
    expect(update.body.data.creditLimit).toBe("750.00");
  });

  it("rejects duplicate phone numbers within the same business", async () => {
    const owner = await registerAndOnboard(app, "CustCrudDup");
    const first = await owner.agent.post("/api/v1/customers").send({
      fullName: "Customer One",
      phone: "+252611222333",
    });
    expect(first.status).toBe(201);

    const dup = await owner.agent.post("/api/v1/customers").send({
      fullName: "Customer Two",
      phone: "+252611222333",
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");
  });

  it("searches and paginates customers", async () => {
    const owner = await registerAndOnboard(app, "CustCrudSearch");
    for (let i = 0; i < 5; i += 1) {
      const res = await owner.agent.post("/api/v1/customers").send({
        fullName: i === 2 ? "Findable Fatima" : `Customer Number ${i}`,
        phone: `+2526112230${i}`,
      });
      expect(res.status).toBe(201);
    }

    const search = await owner.agent.get("/api/v1/customers").query({ search: "Findable" });
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].fullName).toBe("Findable Fatima");

    const page1 = await owner.agent.get("/api/v1/customers").query({ page: 1, pageSize: 2 });
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.total).toBe(5);
    expect(page1.body.meta.totalPages).toBe(3);
  });

  it("manages nested addresses and notes", async () => {
    const owner = await registerAndOnboard(app, "CustCrudNested");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Nested Customer" });
    const customerId = create.body.data.id as string;

    const address = await owner.agent.post(`/api/v1/customers/${customerId}/addresses`).send({
      line1: "123 Main Street",
      city: "Mogadishu",
      isDefault: true,
    });
    expect(address.status).toBe(201);
    const addressId = address.body.data.id as string;

    const listAddresses = await owner.agent.get(`/api/v1/customers/${customerId}/addresses`);
    expect(listAddresses.status).toBe(200);
    expect(listAddresses.body.data).toHaveLength(1);

    const updateAddress = await owner.agent
      .patch(`/api/v1/customers/${customerId}/addresses/${addressId}`)
      .send({ city: "Hargeisa" });
    expect(updateAddress.status).toBe(200);
    expect(updateAddress.body.data.city).toBe("Hargeisa");

    const deleteAddress = await owner.agent.delete(`/api/v1/customers/${customerId}/addresses/${addressId}`);
    expect(deleteAddress.status).toBe(200);

    const note = await owner.agent.post(`/api/v1/customers/${customerId}/notes`).send({
      note: "Prefers WhatsApp contact",
    });
    expect(note.status).toBe(201);

    const listNotes = await owner.agent.get(`/api/v1/customers/${customerId}/notes`);
    expect(listNotes.status).toBe(200);
    expect(listNotes.body.data).toHaveLength(1);
    expect(listNotes.body.data[0].note).toBe("Prefers WhatsApp contact");
  });

  it("refuses to disable a customer with outstanding debt or invoice history", async () => {
    const owner = await registerAndOnboard(app, "CustCrudDisable");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Debtor Customer" });
    const customerId = create.body.data.id as string;

    const sale = await prisma.sale.create({
      data: {
        businessId: owner.businessId,
        branchId: owner.branchId,
        warehouseId: owner.warehouseId,
        customerId,
        saleNumber: `S-DISABLE-${Date.now()}`,
        type: "CREDIT",
        status: "COMPLETED",
        subtotal: "50.00",
        totalAmount: "50.00",
      },
    });
    await prisma.invoice.create({
      data: {
        businessId: owner.businessId,
        saleId: sale.id,
        customerId,
        invoiceNumber: `INV-DISABLE-${Date.now()}`,
        status: "ISSUED",
        subtotal: "50.00",
        totalAmount: "50.00",
        amountDue: "50.00",
        dueDate: new Date(),
      },
    });

    const disable = await owner.agent.delete(`/api/v1/customers/${customerId}`);
    expect(disable.status).toBe(409);
    expect(disable.body.error.code).toBe("CONFLICT");
  });

  it("disables a clean customer with no debt or invoice history", async () => {
    const owner = await registerAndOnboard(app, "CustCrudDisableClean");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Clean Customer" });
    const customerId = create.body.data.id as string;

    const disable = await owner.agent.delete(`/api/v1/customers/${customerId}`);
    expect(disable.status).toBe(200);
    expect(disable.body.data.status).toBe("ARCHIVED");
  });

  it("enforces the customers.create permission", async () => {
    const owner = await registerAndOnboard(app, "CustPermCreate");
    const limited = await createLimitedMember(app, owner, "CustPermCreateMember", ["customers.read"]);

    const attempt = await limited.agent.post("/api/v1/customers").send({ fullName: "Blocked" });
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe("FORBIDDEN");
  });

  it("enforces the customers.update permission", async () => {
    const owner = await registerAndOnboard(app, "CustPermUpdate");
    const create = await owner.agent.post("/api/v1/customers").send({ fullName: "Update Target" });
    const customerId = create.body.data.id as string;

    const limited = await createLimitedMember(app, owner, "CustPermUpdateMember", ["customers.read"]);
    const attempt = await limited.agent.patch(`/api/v1/customers/${customerId}`).send({ fullName: "Hacked" });
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe("FORBIDDEN");
  });

  describe("Tenant isolation", () => {
    it("prevents Business B from reading Business A's customer", async () => {
      const tenantA = await registerAndOnboard(app, "CustIsoReadA");
      const tenantB = await registerAndOnboard(app, "CustIsoReadB");
      const create = await tenantA.agent.post("/api/v1/customers").send({ fullName: "Tenant A Customer" });
      const customerId = create.body.data.id as string;

      const leak = await tenantB.agent.get(`/api/v1/customers/${customerId}`);
      expect(leak.status).toBe(404);
      expect(leak.body.error.code).toBe("NOT_FOUND");
    });

    it("prevents Business B from updating or deleting Business A's customer", async () => {
      const tenantA = await registerAndOnboard(app, "CustIsoWriteA");
      const tenantB = await registerAndOnboard(app, "CustIsoWriteB");
      const create = await tenantA.agent.post("/api/v1/customers").send({ fullName: "Tenant A Customer 2" });
      const customerId = create.body.data.id as string;

      const patchLeak = await tenantB.agent.patch(`/api/v1/customers/${customerId}`).send({ fullName: "Hacked" });
      expect(patchLeak.status).toBe(404);

      const deleteLeak = await tenantB.agent.delete(`/api/v1/customers/${customerId}`);
      expect(deleteLeak.status).toBe(404);

      const stillA = await tenantA.agent.get(`/api/v1/customers/${customerId}`);
      expect(stillA.body.data.fullName).toBe("Tenant A Customer 2");
    });

    it("does not leak Business A's customers into Business B's list", async () => {
      const tenantA = await registerAndOnboard(app, "CustIsoListA");
      const tenantB = await registerAndOnboard(app, "CustIsoListB");
      await tenantA.agent.post("/api/v1/customers").send({ fullName: "Only In A" });

      const listB = await tenantB.agent.get("/api/v1/customers");
      expect(listB.status).toBe(200);
      const namesB = (listB.body.data as Array<{ fullName: string }>).map((c) => c.fullName);
      expect(namesB).not.toContain("Only In A");
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
