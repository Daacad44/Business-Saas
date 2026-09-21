import { createSalePaymentSchema } from "@daljir/validation";
import type { DebtStatus, InvoiceStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { recalculateCustomerBalance } from "../customers/credit.service.js";
import { assertTenant, toDecimal, ZERO } from "./helpers.js";
import { money, serializeDebt, serializeInvoice, serializePayment } from "./serialize.js";

/**
 * Debt Reconciliation step of the Critical Flow:
 * Sale -> Invoice -> Payment -> Outstanding Balance -> Debt -> Due Date ->
 * Automation -> Notification -> Payment -> Debt Reconciliation.
 *
 * Everything below runs inside ONE `prisma.$transaction`: create the
 * `Payment` + `PaymentAllocation`, update `Invoice.amountPaid`/`amountDue`/
 * `status`, update the linked `CustomerDebt` (if the sale was on credit),
 * and `recalculateCustomerBalance`. Overpayment beyond the invoice's
 * `amountDue` is rejected before any writes happen. All money math is
 * `Prisma.Decimal`; the settlement check compares to `ZERO` at 2dp
 * precision so the outstanding balance reconciles to exactly `0.00`.
 */
export async function createSalePayment(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createSalePaymentSchema.parse(req.body);
  const saleId = req.params.id as string;

  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, businessId: tenant.businessId } });
    if (!sale) {
      throw notFound("Sale not found");
    }

    const invoiceRecord = await tx.invoice.findFirst({
      where: { businessId: tenant.businessId, saleId: sale.id },
    });
    if (!invoiceRecord) {
      throw notFound("Invoice not found for this sale");
    }

    if (invoiceRecord.status === "PAID") {
      throw conflict("This invoice is already fully paid");
    }
    if (invoiceRecord.status === "VOID") {
      throw conflict("This invoice is void and cannot accept payments");
    }

    const paymentAmount = toDecimal(input.amount);
    const amountDue = toDecimal(invoiceRecord.amountDue);
    if (paymentAmount.greaterThan(amountDue)) {
      throw conflict(
        `Payment of ${money(paymentAmount)} exceeds the outstanding amount due of ${money(amountDue)}`,
      );
    }

    const newAmountPaid = toDecimal(invoiceRecord.amountPaid).plus(paymentAmount);
    const newAmountDue = amountDue.minus(paymentAmount);
    const invoiceFullyPaid = newAmountDue.lessThanOrEqualTo(0);
    const invoiceStatus: InvoiceStatus = invoiceFullyPaid ? "PAID" : "PARTIALLY_PAID";

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceRecord.id },
      data: {
        amountPaid: newAmountPaid,
        amountDue: invoiceFullyPaid ? ZERO : newAmountDue,
        status: invoiceStatus,
        paidAt: invoiceFullyPaid ? new Date() : invoiceRecord.paidAt,
      },
    });

    const debt = await tx.customerDebt.findFirst({
      where: { businessId: tenant.businessId, invoiceId: invoiceRecord.id },
    });

    let updatedDebt = null;
    if (debt) {
      const debtNewAmountPaid = toDecimal(debt.amountPaid).plus(paymentAmount);
      const debtNewOutstanding = toDecimal(debt.principalAmount).minus(debtNewAmountPaid);
      const debtFullyPaid = debtNewOutstanding.lessThanOrEqualTo(0);
      const debtStatus: DebtStatus = debtFullyPaid ? "PAID" : "PARTIALLY_PAID";

      updatedDebt = await tx.customerDebt.update({
        where: { id: debt.id },
        data: {
          amountPaid: debtNewAmountPaid,
          outstandingAmount: debtFullyPaid ? ZERO : debtNewOutstanding,
          status: debtStatus,
        },
      });
    }

    const payment = await tx.payment.create({
      data: {
        businessId: tenant.businessId,
        invoiceId: invoiceRecord.id,
        customerId: invoiceRecord.customerId,
        method: input.method,
        amount: paymentAmount,
        status: "COMPLETED",
        reference: input.reference,
        receivedById: auth.userId,
        paidAt: input.paidAt ?? new Date(),
        notes: input.notes,
      },
    });

    await tx.paymentAllocation.create({
      data: {
        businessId: tenant.businessId,
        paymentId: payment.id,
        invoiceId: invoiceRecord.id,
        debtId: updatedDebt?.id ?? null,
        amount: paymentAmount,
      },
    });

    let customerBalance: string | null = null;
    if (invoiceRecord.customerId) {
      const balance = await recalculateCustomerBalance(tx, {
        businessId: tenant.businessId,
        customerId: invoiceRecord.customerId,
      });
      customerBalance = balance.currentBalance;
    }

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "sale.payment_collected",
        entityType: "Invoice",
        entityId: invoiceRecord.id,
        metadata: {
          saleId: sale.id,
          amount: money(paymentAmount),
          newAmountDue: money(updatedInvoice.amountDue),
          invoiceStatus,
        },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { payment, invoice: updatedInvoice, debt: updatedDebt, customerBalance };
  });

  return sendData(
    res,
    {
      payment: serializePayment(result.payment),
      invoice: serializeInvoice(result.invoice),
      debt: result.debt ? serializeDebt(result.debt) : null,
      customerBalance: result.customerBalance,
    },
    201,
  );
}
