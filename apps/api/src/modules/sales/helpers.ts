import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

export function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export const ZERO = new Prisma.Decimal(0);

/** Clamps a Decimal into [min, max]. decimal.js has no built-in clamp. */
export function clampDecimal(value: Prisma.Decimal, min: Prisma.Decimal, max: Prisma.Decimal): Prisma.Decimal {
  if (value.lessThan(min)) return min;
  if (value.greaterThan(max)) return max;
  return value;
}

export async function findSaleOr404(
  client: Prisma.TransactionClient | typeof prisma,
  businessId: string,
  saleId: string,
) {
  const sale = await client.sale.findFirst({ where: { id: saleId, businessId } });
  if (!sale) {
    throw notFound("Sale not found");
  }
  return sale;
}

export async function findInvoiceOr404(
  client: Prisma.TransactionClient | typeof prisma,
  businessId: string,
  invoiceId: string,
) {
  const invoice = await client.invoice.findFirst({ where: { id: invoiceId, businessId } });
  if (!invoice) {
    throw notFound("Invoice not found");
  }
  return invoice;
}
