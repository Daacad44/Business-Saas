import { createSaleSchema } from "@daljir/validation";
import { Prisma, type SaleType } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { checkCreditEligibility, recalculateCustomerBalance } from "../customers/credit.service.js";
import { applyStockMovement, assertSufficientStock } from "../inventory/stock.service.js";
import { assertTenant, clampDecimal, findSaleOr404, toDecimal, ZERO } from "./helpers.js";
import { nextSequenceNumber } from "./numbering.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { money, serializeDebt, serializeInvoice, serializePayment, serializeSale } from "./serialize.js";

/**
 * DECIMAL PRECISION APPROACH:
 * All money/quantity math uses `Prisma.Decimal`. Client-supplied numbers
 * (validated by `createSaleSchema`, which only guarantees they are finite
 * JS numbers) are converted to `Decimal` immediately and never used in raw
 * floating point arithmetic. Server-computed values (subtotal, discount,
 * tax, total) are Decimals throughout the transaction and only rendered to
 * `.toFixed(2)` strings at the JSON boundary via `serialize.ts`.
 *
 * PRICE INTEGRITY: `createSaleSchema` has no manual price-override flag, so
 * unit prices are NEVER taken from the client. Every line's `unitPrice` is
 * recomputed from the tenant's own `Product`/`ProductVariant` record inside
 * the transaction. The client-supplied `unitPrice`/`taxAmount` are ignored
 * for computation (schema still validates their shape so malformed payloads
 * are rejected, but the values are not trusted). Per-line `discountAmount`
 * is treated as a legitimate cashier-applied discount and is clamped to the
 * line subtotal so it can never make a line negative.
 */

type ResolvedLine = {
  productId: string;
  variantId: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTax: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

export async function createSale(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createSaleSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    // ---- 1. Tenant-scoped resolution of every foreign id in the payload ----
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, businessId: tenant.businessId },
    });
    if (!branch) {
      throw notFound("Branch not found");
    }

    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, businessId: tenant.businessId, branchId: branch.id },
    });
    if (!warehouse) {
      throw notFound("Warehouse not found");
    }

    let customer: { id: string } | null = null;
    if (input.customerId) {
      customer = await tx.customer.findFirst({
        where: { id: input.customerId, businessId: tenant.businessId },
        select: { id: true },
      });
      if (!customer) {
        throw notFound("Customer not found");
      }
    }

    // ---- 2. Resolve + validate every line against the tenant's own catalogue ----
    const lines: ResolvedLine[] = [];
    for (const item of input.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, businessId: tenant.businessId },
      });
      if (!product) {
        throw notFound("Product not found");
      }

      let variant: { id: string; sellingPrice: Prisma.Decimal; costPrice: Prisma.Decimal } | null = null;
      if (item.variantId) {
        variant = await tx.productVariant.findFirst({
          where: { id: item.variantId, businessId: tenant.businessId, productId: product.id },
          select: { id: true, sellingPrice: true, costPrice: true },
        });
        if (!variant) {
          throw notFound("Product variant not found");
        }
      }

      const quantity = toDecimal(item.quantity);
      const unitPrice = variant ? toDecimal(variant.sellingPrice) : toDecimal(product.sellingPrice);
      const costPrice = variant ? toDecimal(variant.costPrice) : toDecimal(product.costPrice);
      const taxRate = toDecimal(product.taxRate);

      const rawLineSubtotal = unitPrice.times(quantity);
      const discountAmount = clampDecimal(toDecimal(item.discountAmount ?? 0), ZERO, rawLineSubtotal);
      const taxableAmount = rawLineSubtotal.minus(discountAmount);
      const lineTax = taxableAmount.times(taxRate).dividedBy(100);
      const lineTotal = taxableAmount.plus(lineTax);

      lines.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        quantity,
        unitPrice,
        costPrice,
        taxRate,
        discountAmount,
        lineSubtotal: rawLineSubtotal,
        lineTax,
        lineTotal,
      });
    }

    // ---- 3. Compute sale-level totals with Decimal only ----
    const subtotal = lines.reduce((sum, line) => sum.plus(line.lineSubtotal), ZERO);
    const itemDiscountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), ZERO);
    const itemTaxTotal = lines.reduce((sum, line) => sum.plus(line.lineTax), ZERO);
    const remainingAfterItemDiscount = subtotal.minus(itemDiscountTotal);
    const additionalDiscount = clampDecimal(toDecimal(input.discountAmount ?? 0), ZERO, remainingAfterItemDiscount);
    const totalDiscount = itemDiscountTotal.plus(additionalDiscount);
    const totalAmount = subtotal.minus(totalDiscount).plus(itemTaxTotal);

    // ---- 4. Sequential numbering (always sale, then invoice — fixed lock order) ----
    const saleNumber = await nextSequenceNumber(tx, { businessId: tenant.businessId, kind: "sale", prefix: "S" });

    const sale = await tx.sale.create({
      data: {
        businessId: tenant.businessId,
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer?.id ?? null,
        cashierId: auth.userId,
        saleNumber,
        type: input.type as SaleType,
        status: "COMPLETED",
        subtotal,
        discountAmount: totalDiscount,
        taxAmount: itemTaxTotal,
        totalAmount,
        notes: input.notes,
      },
    });

    // ---- 5. Stock movements + sale items (never sell stock without a ledger row) ----
    const createdItems = [];
    for (const line of lines) {
      await assertSufficientStock(tx, {
        businessId: tenant.businessId,
        warehouseId: warehouse.id,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
      });

      const movement = await applyStockMovement(tx, {
        businessId: tenant.businessId,
        warehouseId: warehouse.id,
        productId: line.productId,
        variantId: line.variantId,
        type: "SALE_OUT",
        quantity: line.quantity.negated(),
        unitCost: line.costPrice,
        referenceType: "SALE",
        referenceId: sale.id,
        createdById: auth.userId,
      });

      const saleItem = await tx.saleItem.create({
        data: {
          businessId: tenant.businessId,
          saleId: sale.id,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.lineTax,
          totalAmount: line.lineTotal,
          costPriceSnapshot: line.costPrice,
          movementId: movement.id,
        },
      });
      createdItems.push(saleItem);
    }

    // ---- 6. Invoice ----
    const invoiceNumber = await nextSequenceNumber(tx, {
      businessId: tenant.businessId,
      kind: "invoice",
      prefix: "INV",
    });

    const isCash = input.type === "CASH";
    const invoice = await tx.invoice.create({
      data: {
        businessId: tenant.businessId,
        saleId: sale.id,
        customerId: customer?.id ?? null,
        invoiceNumber,
        status: isCash ? "PAID" : "ISSUED",
        subtotal,
        discountAmount: totalDiscount,
        taxAmount: itemTaxTotal,
        totalAmount,
        amountPaid: isCash ? totalAmount : ZERO,
        amountDue: isCash ? ZERO : totalAmount,
        dueDate: isCash ? null : input.dueDate,
        paidAt: isCash ? new Date() : null,
      },
    });

    let payment = null;
    let debt = null;
    let customerBalance: string | null = null;

    if (isCash) {
      // ---- 7a. CASH sale: pay in full immediately ----
      const createdPayment = await tx.payment.create({
        data: {
          businessId: tenant.businessId,
          invoiceId: invoice.id,
          customerId: customer?.id ?? null,
          method: "CASH",
          amount: totalAmount,
          status: "COMPLETED",
          receivedById: auth.userId,
        },
      });
      await tx.paymentAllocation.create({
        data: {
          businessId: tenant.businessId,
          paymentId: createdPayment.id,
          invoiceId: invoice.id,
          amount: totalAmount,
        },
      });
      payment = createdPayment;
    } else {
      // ---- 7b. CREDIT sale: enforce credit eligibility, then create debt ----
      if (!customer) {
        throw conflict("Credit sales require a customer");
      }
      const eligibility = await checkCreditEligibility(tx, {
        businessId: tenant.businessId,
        customerId: customer.id,
        amount: totalAmount,
      });
      if (!eligibility.allowed) {
        throw conflict(
          `Credit sale rejected: customer is not eligible for this amount (reason: ${eligibility.reason}, available credit: ${eligibility.availableCredit})`,
        );
      }

      debt = await tx.customerDebt.create({
        data: {
          businessId: tenant.businessId,
          customerId: customer.id,
          invoiceId: invoice.id,
          principalAmount: totalAmount,
          amountPaid: ZERO,
          outstandingAmount: totalAmount,
          dueDate: input.dueDate as Date,
          status: "PENDING",
        },
      });

      const balance = await recalculateCustomerBalance(tx, {
        businessId: tenant.businessId,
        customerId: customer.id,
      });
      customerBalance = balance.currentBalance;
    }

    // ---- 8. Audit trail ----
    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "sale.create",
        entityType: "Sale",
        entityId: sale.id,
        metadata: {
          saleNumber,
          invoiceNumber,
          type: input.type,
          totalAmount: money(totalAmount),
        },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { sale, items: createdItems, invoice, payment, debt, customerBalance };
  });

  return sendData(
    res,
    {
      ...serializeSale({ ...result.sale, items: result.items }),
      invoice: serializeInvoice(result.invoice),
      payment: result.payment ? serializePayment(result.payment) : null,
      debt: result.debt ? serializeDebt(result.debt) : null,
      customerBalance: result.customerBalance,
    },
    201,
  );
}

export async function listSales(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);

  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  const type = typeof req.query.type === "string" ? (req.query.type as SaleType) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "soldAt";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

  const allowedSort = new Set(["soldAt", "createdAt", "totalAmount", "saleNumber"]);
  const orderBy = allowedSort.has(sortBy) ? { [sortBy]: sortOrder } : { soldAt: "desc" as const };

  const where: Prisma.SaleWhereInput = {
    businessId: tenant.businessId,
    ...(branchId ? { branchId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(customerId ? { customerId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status: status as Prisma.EnumSaleStatusFilter["equals"] } : {}),
    ...(search ? { saleNumber: { contains: search, mode: "insensitive" } } : {}),
    ...(dateFrom || dateTo
      ? {
          soldAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({ where, orderBy, skip: pagination.skip, take: pagination.take }),
    prisma.sale.count({ where }),
  ]);

  return sendData(res, sales.map((sale) => serializeSale(sale)), 200, paginationMeta(pagination, total));
}

export async function getSale(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const sale = await findSaleOr404(prisma, tenant.businessId, req.params.id as string);

  const [items, invoice] = await Promise.all([
    prisma.saleItem.findMany({ where: { businessId: tenant.businessId, saleId: sale.id } }),
    prisma.invoice.findFirst({ where: { businessId: tenant.businessId, saleId: sale.id } }),
  ]);

  let payments: Awaited<ReturnType<typeof prisma.payment.findMany>> = [];
  let debt: Awaited<ReturnType<typeof prisma.customerDebt.findFirst>> = null;
  if (invoice) {
    [payments, debt] = await Promise.all([
      prisma.payment.findMany({ where: { businessId: tenant.businessId, invoiceId: invoice.id } }),
      prisma.customerDebt.findFirst({ where: { businessId: tenant.businessId, invoiceId: invoice.id } }),
    ]);
  }

  return sendData(res, {
    ...serializeSale({ ...sale, items }),
    invoice: invoice ? serializeInvoice(invoice) : null,
    payments: payments.map(serializePayment),
    debt: debt ? serializeDebt(debt) : null,
  });
}
