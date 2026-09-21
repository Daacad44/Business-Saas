import { createSupplierPaymentSchema, createSupplierSchema, updateSupplierSchema } from "@daljir/validation";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { recalculateSupplierBalance, toDecimal } from "./balance.service.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import {
  money,
  serializePurchase,
  serializeSupplier,
  serializeSupplierPayment,
} from "./serialize.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

async function findSupplierOr404(businessId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, businessId },
  });
  if (!supplier) {
    throw notFound("Supplier not found");
  }
  return supplier;
}

export async function listSuppliers(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

  const allowedSort = new Set(["name", "createdAt", "currentBalance"]);
  const orderBy = allowedSort.has(sortBy) ? { [sortBy]: sortOrder } : { createdAt: "desc" as const };

  const where: Prisma.SupplierWhereInput = {
    businessId: tenant.businessId,
    ...(status ? { status: status as Prisma.EnumSupplierStatusFilter["equals"] } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.supplier.count({ where }),
  ]);

  return sendData(res, suppliers.map(serializeSupplier), 200, paginationMeta(pagination, total));
}

export async function createSupplier(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createSupplierSchema.parse(req.body);

  const supplier = await prisma.supplier.create({
    data: {
      businessId: tenant.businessId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      contactPerson: input.contactPerson,
      notes: input.notes,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "supplier.create",
    entityType: "Supplier",
    entityId: supplier.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeSupplier(supplier), 201);
}

export async function getSupplier(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const supplier = await findSupplierOr404(tenant.businessId, req.params.id as string);
  return sendData(res, serializeSupplier(supplier));
}

export async function updateSupplier(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateSupplierSchema.parse(req.body);
  const supplier = await findSupplierOr404(tenant.businessId, req.params.id as string);

  const updated = await prisma.supplier.update({
    where: { id: supplier.id },
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      contactPerson: input.contactPerson,
      notes: input.notes,
      status: input.status,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "supplier.update",
    entityType: "Supplier",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeSupplier(updated));
}

/**
 * Hard deletion is refused whenever the supplier has purchase history (any
 * Purchase or PurchaseOrder row) or an outstanding payable
 * (`currentBalance > 0`). In every other case we soft-disable by setting
 * `status = ARCHIVED` rather than physically deleting the row, so historical
 * references (audit logs, foreign keys) always remain resolvable.
 */
export async function disableSupplier(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const supplier = await findSupplierOr404(tenant.businessId, req.params.id as string);

  if (toDecimal(supplier.currentBalance).greaterThan(0)) {
    throw conflict("Cannot delete a supplier with an outstanding payable balance");
  }

  const purchaseCount = await prisma.purchase.count({
    where: { businessId: tenant.businessId, supplierId: supplier.id },
  });
  if (purchaseCount > 0) {
    throw conflict("Cannot delete a supplier with purchase history");
  }

  const orderCount = await prisma.purchaseOrder.count({
    where: { businessId: tenant.businessId, supplierId: supplier.id },
  });
  if (orderCount > 0) {
    throw conflict("Cannot delete a supplier with purchase order history");
  }

  const updated = await prisma.supplier.update({
    where: { id: supplier.id },
    data: { status: "ARCHIVED" },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "supplier.disable",
    entityType: "Supplier",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeSupplier(updated));
}

export async function listSupplierPurchases(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const supplier = await findSupplierOr404(tenant.businessId, req.params.id as string);
  const pagination = parsePagination(req);
  const where: Prisma.PurchaseWhereInput = { businessId: tenant.businessId, supplierId: supplier.id };

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.purchase.count({ where }),
  ]);

  return sendData(res, purchases.map(serializePurchase), 200, paginationMeta(pagination, total));
}

export async function listSupplierPayments(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const supplier = await findSupplierOr404(tenant.businessId, req.params.id as string);
  const pagination = parsePagination(req);
  const where: Prisma.SupplierPaymentWhereInput = { businessId: tenant.businessId, supplierId: supplier.id };

  const [payments, total] = await Promise.all([
    prisma.supplierPayment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.supplierPayment.count({ where }),
  ]);

  return sendData(res, payments.map(serializeSupplierPayment), 200, paginationMeta(pagination, total));
}

/**
 * Creates a SupplierPayment. When `purchaseId` is provided the payment is
 * applied directly to that purchase (which must belong to the same business
 * AND the same supplier — otherwise 404). Overpaying a single purchase is
 * rejected with 409.
 *
 * When `purchaseId` is omitted, the payment is applied FIFO across the
 * supplier's outstanding purchases (oldest `receivedAt` first). The
 * SupplierPayment row itself is recorded with `purchaseId = null` (a general
 * payment on account) while each underlying Purchase's `amountPaid`/
 * `amountDue` is updated. Overpaying beyond the supplier's total outstanding
 * balance is rejected with 409.
 *
 * `Supplier.currentBalance` is always recalculated from the authoritative
 * `Purchase.amountDue` rows inside the same transaction, so it can never
 * drift from the underlying ledger.
 */
export async function createSupplierPayment(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createSupplierPaymentSchema.parse(req.body);
  const supplierId = req.params.id as string;

  const result = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, businessId: tenant.businessId },
    });
    if (!supplier) {
      throw notFound("Supplier not found");
    }

    const paymentAmount = toDecimal(input.amount);
    let targetPurchaseId: string | null = null;

    if (input.purchaseId) {
      const purchase = await tx.purchase.findFirst({
        where: { id: input.purchaseId, businessId: tenant.businessId, supplierId: supplier.id },
      });
      if (!purchase) {
        throw notFound("Purchase not found");
      }

      const outstanding = toDecimal(purchase.amountDue);
      if (paymentAmount.greaterThan(outstanding)) {
        throw conflict(
          `Payment of ${paymentAmount.toFixed(2)} exceeds the outstanding balance of ${outstanding.toFixed(2)} on this purchase`,
        );
      }

      const newAmountPaid = toDecimal(purchase.amountPaid).plus(paymentAmount);
      const newAmountDue = outstanding.minus(paymentAmount);
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue.lessThanOrEqualTo(0) ? new Prisma.Decimal(0) : newAmountDue,
        },
      });
      targetPurchaseId = purchase.id;
    } else {
      const outstandingPurchases = await tx.purchase.findMany({
        where: { businessId: tenant.businessId, supplierId: supplier.id, status: { not: "CANCELLED" }, amountDue: { gt: 0 } },
        orderBy: { receivedAt: "asc" },
      });

      const totalOutstanding = outstandingPurchases.reduce(
        (sum, purchase) => sum.plus(toDecimal(purchase.amountDue)),
        new Prisma.Decimal(0),
      );

      if (paymentAmount.greaterThan(totalOutstanding)) {
        throw conflict(
          `Payment of ${paymentAmount.toFixed(2)} exceeds the supplier's total outstanding balance of ${totalOutstanding.toFixed(2)}`,
        );
      }

      let remaining = paymentAmount;
      for (const purchase of outstandingPurchases) {
        if (remaining.lessThanOrEqualTo(0)) break;
        const outstanding = toDecimal(purchase.amountDue);
        const applied = Prisma.Decimal.min(outstanding, remaining);
        const newAmountDue = outstanding.minus(applied);
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            amountPaid: toDecimal(purchase.amountPaid).plus(applied),
            amountDue: newAmountDue.lessThanOrEqualTo(0) ? new Prisma.Decimal(0) : newAmountDue,
          },
        });
        remaining = remaining.minus(applied);
      }
    }

    const payment = await tx.supplierPayment.create({
      data: {
        businessId: tenant.businessId,
        supplierId: supplier.id,
        purchaseId: targetPurchaseId,
        amount: paymentAmount,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        paidById: auth.userId,
        paidAt: input.paidAt ?? new Date(),
      },
    });

    const balance = await recalculateSupplierBalance(tx, {
      businessId: tenant.businessId,
      supplierId: supplier.id,
    });

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "supplier_payment.create",
        entityType: "SupplierPayment",
        entityId: payment.id,
        metadata: { amount: money(paymentAmount), newSupplierBalance: balance.currentBalance },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { payment, currentBalance: balance.currentBalance };
  });

  return sendData(
    res,
    { payment: serializeSupplierPayment(result.payment), supplierCurrentBalance: result.currentBalance },
    201,
  );
}
