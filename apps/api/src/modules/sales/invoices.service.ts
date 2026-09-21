import { listInvoicesQuerySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { assertTenant } from "./helpers.js";
import { buildInvoiceListWhere } from "./invoice-query.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { serializeDebt, serializeInvoice, serializePayment, serializeSale } from "./serialize.js";

async function findInvoiceForTenant(businessId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId } });
  if (!invoice) {
    throw notFound("Invoice not found");
  }
  return invoice;
}

/**
 * Overdue is the canonical `overdueInvoiceWhere` predicate (outstanding
 * balance + dueDate before the start of today in `Business.timezone`).
 * Stored `InvoiceStatus.OVERDUE` is never written and is never queried.
 * `status=OVERDUE` is an alias for that predicate, not a column match.
 */
export async function listInvoices(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const { status } = listInvoicesQuerySchema.parse(req.query);

  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  const overdueOnly = req.query.overdueOnly === "true";
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const where = await buildInvoiceListWhere({
    businessId: tenant.businessId,
    customerId,
    status,
    overdueOnly,
    search: search || undefined,
    dateFrom,
    dateTo,
  });

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.invoice.count({ where }),
  ]);

  return sendData(res, invoices.map(serializeInvoice), 200, paginationMeta(pagination, total));
}

export async function getInvoice(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const invoice = await findInvoiceForTenant(tenant.businessId, req.params.id as string);

  const [sale, items, payments, debt] = await Promise.all([
    prisma.sale.findFirst({ where: { id: invoice.saleId, businessId: tenant.businessId } }),
    prisma.saleItem.findMany({ where: { businessId: tenant.businessId, saleId: invoice.saleId } }),
    prisma.payment.findMany({ where: { businessId: tenant.businessId, invoiceId: invoice.id } }),
    prisma.customerDebt.findFirst({ where: { businessId: tenant.businessId, invoiceId: invoice.id } }),
  ]);

  return sendData(res, {
    ...serializeInvoice(invoice),
    sale: sale ? serializeSale({ ...sale, items }) : null,
    payments: payments.map(serializePayment),
    debt: debt ? serializeDebt(debt) : null,
  });
}

export async function getInvoiceReceipt(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const invoice = await findInvoiceForTenant(tenant.businessId, req.params.id as string);

  const [sale, items, business, customer, payments] = await Promise.all([
    prisma.sale.findFirst({ where: { id: invoice.saleId, businessId: tenant.businessId } }),
    prisma.saleItem.findMany({ where: { businessId: tenant.businessId, saleId: invoice.saleId } }),
    prisma.business.findUnique({ where: { id: tenant.businessId }, select: { id: true, name: true } }),
    invoice.customerId
      ? prisma.customer.findFirst({
          where: { id: invoice.customerId, businessId: tenant.businessId },
          select: { id: true, fullName: true, phone: true, email: true },
        })
      : Promise.resolve(null),
    prisma.payment.findMany({ where: { businessId: tenant.businessId, invoiceId: invoice.id } }),
  ]);

  if (!sale) {
    throw notFound("Sale not found for this invoice");
  }

  return sendData(res, {
    business,
    invoice: serializeInvoice(invoice),
    sale: serializeSale({ ...sale, items }),
    customer,
    payments: payments.map(serializePayment),
  });
}
