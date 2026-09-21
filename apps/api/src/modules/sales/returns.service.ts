import { createSalesReturnSchema } from "@daljir/validation";
import type { DebtStatus, InvoiceStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { recalculateCustomerBalance } from "../customers/credit.service.js";
import { applyStockMovement } from "../inventory/stock.service.js";
import { assertTenant, toDecimal, ZERO } from "./helpers.js";
import { nextSequenceNumber } from "./numbering.js";
import { serializeDebt, serializeInvoice, serializeSalesReturn } from "./serialize.js";

export async function createSalesReturn(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createSalesReturnSchema.parse(req.body);
  const saleId = req.params.id as string;

  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, businessId: tenant.businessId } });
    if (!sale) {
      throw notFound("Sale not found");
    }

    const invoice = await tx.invoice.findFirst({
      where: { businessId: tenant.businessId, saleId: sale.id },
    });

    const lines: Array<{
      saleItemId: string;
      productId: string;
      variantId: string | null;
      quantity: ReturnType<typeof toDecimal>;
      unitPrice: ReturnType<typeof toDecimal>;
      totalAmount: ReturnType<typeof toDecimal>;
    }> = [];

    for (const returnItem of input.items) {
      const saleItem = await tx.saleItem.findFirst({
        where: { id: returnItem.saleItemId, businessId: tenant.businessId, saleId: sale.id },
      });
      if (!saleItem) {
        throw notFound("Sale item not found on this sale");
      }

      const alreadyReturned = await tx.salesReturnItem.aggregate({
        where: { businessId: tenant.businessId, saleItemId: saleItem.id },
        _sum: { quantity: true },
      });
      const previouslyReturned = toDecimal(alreadyReturned._sum.quantity ?? 0);
      const requestedQuantity = toDecimal(returnItem.quantity);
      const soldQuantity = toDecimal(saleItem.quantity);

      if (previouslyReturned.plus(requestedQuantity).greaterThan(soldQuantity)) {
        throw conflict(
          `Return quantity exceeds remaining returnable quantity for sale item ${saleItem.id} (sold ${soldQuantity.toFixed(3)}, already returned ${previouslyReturned.toFixed(3)})`,
        );
      }

      const unitPrice = toDecimal(saleItem.unitPrice);
      const lineTotal = unitPrice.times(requestedQuantity);

      lines.push({
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        variantId: saleItem.variantId,
        quantity: requestedQuantity,
        unitPrice,
        totalAmount: lineTotal,
      });
    }

    const totalAmount = lines.reduce((sum, line) => sum.plus(line.totalAmount), ZERO);

    const returnNumber = await nextSequenceNumber(tx, {
      businessId: tenant.businessId,
      kind: "return",
      prefix: "RET",
    });

    const salesReturn = await tx.salesReturn.create({
      data: {
        businessId: tenant.businessId,
        saleId: sale.id,
        customerId: sale.customerId,
        returnNumber,
        reason: input.reason,
        status: "COMPLETED",
        totalAmount,
        processedById: auth.userId,
      },
    });

    const createdItems = [];
    for (const line of lines) {
      const movement = await applyStockMovement(tx, {
        businessId: tenant.businessId,
        warehouseId: sale.warehouseId,
        productId: line.productId,
        variantId: line.variantId,
        type: "RETURN_IN",
        quantity: line.quantity,
        referenceType: "SALES_RETURN",
        referenceId: salesReturn.id,
        createdById: auth.userId,
      });

      const item = await tx.salesReturnItem.create({
        data: {
          businessId: tenant.businessId,
          returnId: salesReturn.id,
          saleItemId: line.saleItemId,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          totalAmount: line.totalAmount,
          movementId: movement.id,
        },
      });
      createdItems.push(item);
    }

    let updatedInvoice = invoice;
    let updatedDebt = null;
    let customerBalance: string | null = null;

    if (invoice) {
      const newInvoiceTotal = toDecimal(invoice.totalAmount).minus(totalAmount);
      const clampedTotal = newInvoiceTotal.lessThan(0) ? ZERO : newInvoiceTotal;
      const currentPaid = toDecimal(invoice.amountPaid);
      const newAmountPaid = currentPaid.greaterThan(clampedTotal) ? clampedTotal : currentPaid;
      const newAmountDue = clampedTotal.minus(newAmountPaid);
      const invoiceStatus: InvoiceStatus = newAmountDue.lessThanOrEqualTo(0)
        ? "PAID"
        : newAmountPaid.greaterThan(0)
          ? "PARTIALLY_PAID"
          : invoice.status === "PAID"
            ? "ISSUED"
            : invoice.status;

      updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: clampedTotal,
          amountPaid: newAmountPaid,
          amountDue: newAmountDue.lessThanOrEqualTo(0) ? ZERO : newAmountDue,
          status: invoiceStatus,
        },
      });

      const debt = await tx.customerDebt.findFirst({
        where: { businessId: tenant.businessId, invoiceId: invoice.id },
      });
      if (debt) {
        const debtOutstanding = toDecimal(debt.principalAmount).minus(totalAmount).minus(toDecimal(debt.amountPaid));
        const newPrincipal = toDecimal(debt.principalAmount).minus(totalAmount);
        const clampedPrincipal = newPrincipal.lessThan(0) ? ZERO : newPrincipal;
        const clampedOutstanding = debtOutstanding.lessThan(0) ? ZERO : debtOutstanding;
        const debtStatus: DebtStatus = clampedOutstanding.lessThanOrEqualTo(0) ? "PAID" : debt.status;

        updatedDebt = await tx.customerDebt.update({
          where: { id: debt.id },
          data: {
            principalAmount: clampedPrincipal,
            outstandingAmount: clampedOutstanding,
            status: debtStatus,
          },
        });
      }

      if (invoice.customerId) {
        const balance = await recalculateCustomerBalance(tx, {
          businessId: tenant.businessId,
          customerId: invoice.customerId,
        });
        customerBalance = balance.currentBalance;
      }
    }

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "sale.return_created",
        entityType: "SalesReturn",
        entityId: salesReturn.id,
        metadata: { saleId: sale.id, returnNumber, totalAmount: totalAmount.toFixed(2) },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { salesReturn, items: createdItems, invoice: updatedInvoice, debt: updatedDebt, customerBalance };
  });

  return sendData(
    res,
    {
      ...serializeSalesReturn({ ...result.salesReturn, items: result.items }),
      invoice: result.invoice ? serializeInvoice(result.invoice) : null,
      debt: result.debt ? serializeDebt(result.debt) : null,
      customerBalance: result.customerBalance,
    },
    201,
  );
}
