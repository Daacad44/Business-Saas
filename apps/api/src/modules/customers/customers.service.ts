import {
  createCustomerAddressSchema,
  createCustomerNoteSchema,
  createCustomerSchema,
  updateCustomerSchema,
} from "@daljir/validation";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { checkCreditEligibility } from "./credit.service.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { money, serializeCustomer, serializeDebt, serializeDebtPayment, serializeSale } from "./serialize.js";

const creditLimitSchema = updateCustomerSchema.pick({ creditLimit: true }).required();
const addressUpdateSchema = createCustomerAddressSchema.partial();

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

async function findCustomerOr404(businessId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
  });
  if (!customer) {
    throw notFound("Customer not found");
  }
  return customer;
}

export async function listCustomers(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

  const allowedSort = new Set(["fullName", "createdAt", "currentBalance", "creditLimit"]);
  const orderBy = allowedSort.has(sortBy) ? { [sortBy]: sortOrder } : { createdAt: "desc" as const };

  const where: Prisma.CustomerWhereInput = {
    businessId: tenant.businessId,
    ...(type ? { type: type as Prisma.EnumCustomerTypeFilter["equals"] } : {}),
    ...(status ? { status: status as Prisma.EnumCustomerStatusFilter["equals"] } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.customer.count({ where }),
  ]);

  return sendData(
    res,
    customers.map(serializeCustomer),
    200,
    paginationMeta(pagination, total),
  );
}

export async function createCustomer(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createCustomerSchema.parse(req.body);

  if (input.phone) {
    const existing = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId: tenant.businessId, phone: input.phone } },
    });
    if (existing) {
      throw conflict("A customer with this phone number already exists");
    }
  }

  const customer = await prisma.customer.create({
    data: {
      businessId: tenant.businessId,
      type: input.type,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      creditLimit: input.creditLimit,
      notes: input.notes,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "customer.create",
    entityType: "Customer",
    entityId: customer.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeCustomer(customer), 201);
}

export async function getCustomer(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  return sendData(res, serializeCustomer(customer));
}

export async function updateCustomer(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateCustomerSchema.parse(req.body);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);

  if (input.phone && input.phone !== customer.phone) {
    const existing = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId: tenant.businessId, phone: input.phone } },
    });
    if (existing && existing.id !== customer.id) {
      throw conflict("A customer with this phone number already exists");
    }
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      type: input.type,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      creditLimit: input.creditLimit,
      notes: input.notes,
      status: input.status,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "customer.update",
    entityType: "Customer",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeCustomer(updated));
}

export async function disableCustomer(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);

  const outstandingDebt = await prisma.customerDebt.findFirst({
    where: {
      businessId: tenant.businessId,
      customerId: customer.id,
      status: { notIn: ["PAID", "CANCELLED"] },
    },
    select: { id: true },
  });
  if (outstandingDebt || new Prisma.Decimal(customer.currentBalance).greaterThan(0)) {
    throw conflict("Cannot disable a customer with outstanding debt");
  }

  const invoiceCount = await prisma.invoice.count({
    where: { businessId: tenant.businessId, customerId: customer.id },
  });
  if (invoiceCount > 0) {
    throw conflict("Cannot disable a customer with historical invoices");
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { status: "ARCHIVED" },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "customer.disable",
    entityType: "Customer",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeCustomer(updated));
}

export async function updateCreditLimit(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = creditLimitSchema.parse(req.body);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);

  const previousLimit = money(customer.creditLimit);
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { creditLimit: input.creditLimit },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "customer.credit_limit_update",
    entityType: "Customer",
    entityId: updated.id,
    metadata: { previousLimit, newLimit: money(updated.creditLimit) },
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeCustomer(updated));
}

export async function getAvailableCredit(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const result = await prisma.$transaction((tx) =>
    checkCreditEligibility(tx, {
      businessId: tenant.businessId,
      customerId: customer.id,
      amount: "0",
    }),
  );
  return sendData(res, {
    customerId: customer.id,
    creditLimit: result.creditLimit,
    currentBalance: result.currentBalance,
    availableCredit: result.availableCredit,
  });
}

export async function listAddresses(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const addresses = await prisma.customerAddress.findMany({
    where: { businessId: tenant.businessId, customerId: customer.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return sendData(res, addresses);
}

export async function createAddress(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const input = createCustomerAddressSchema.parse(req.body);

  const address = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.customerAddress.updateMany({
        where: { businessId: tenant.businessId, customerId: customer.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.customerAddress.create({
      data: {
        businessId: tenant.businessId,
        customerId: customer.id,
        label: input.label,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        region: input.region,
        country: input.country,
        isDefault: input.isDefault,
      },
    });
  });

  return sendData(res, address, 201);
}

export async function updateAddress(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const input = addressUpdateSchema.parse(req.body);

  const address = await prisma.customerAddress.findFirst({
    where: { id: req.params.addressId, businessId: tenant.businessId, customerId: customer.id },
  });
  if (!address) {
    throw notFound("Address not found");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.customerAddress.updateMany({
        where: { businessId: tenant.businessId, customerId: customer.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.customerAddress.update({
      where: { id: address.id },
      data: {
        label: input.label,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        region: input.region,
        country: input.country,
        isDefault: input.isDefault,
      },
    });
  });

  return sendData(res, updated);
}

export async function deleteAddress(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const address = await prisma.customerAddress.findFirst({
    where: { id: req.params.addressId, businessId: tenant.businessId, customerId: customer.id },
  });
  if (!address) {
    throw notFound("Address not found");
  }
  await prisma.customerAddress.delete({ where: { id: address.id } });
  return sendData(res, { ok: true });
}

export async function listNotes(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const notes = await prisma.customerNote.findMany({
    where: { businessId: tenant.businessId, customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  return sendData(res, notes);
}

export async function createNote(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const input = createCustomerNoteSchema.parse(req.body);

  const note = await prisma.customerNote.create({
    data: {
      businessId: tenant.businessId,
      customerId: customer.id,
      authorId: auth.userId,
      note: input.note,
    },
  });

  return sendData(res, note, 201);
}

export async function listCustomerDebts(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const debts = await prisma.customerDebt.findMany({
    where: { businessId: tenant.businessId, customerId: customer.id },
    orderBy: { dueDate: "asc" },
  });
  return sendData(res, debts.map(serializeDebt));
}

export async function listCustomerPayments(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const payments = await prisma.debtPayment.findMany({
    where: { businessId: tenant.businessId, debt: { customerId: customer.id } },
    orderBy: { paidAt: "desc" },
  });
  return sendData(res, payments.map(serializeDebtPayment));
}

export async function listCustomerSales(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customer = await findCustomerOr404(tenant.businessId, req.params.id as string);
  const pagination = parsePagination(req);
  const where: Prisma.SaleWhereInput = { businessId: tenant.businessId, customerId: customer.id };

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { soldAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.sale.count({ where }),
  ]);

  return sendData(res, sales.map(serializeSale), 200, paginationMeta(pagination, total));
}
