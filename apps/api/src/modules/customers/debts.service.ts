import { createDebtPaymentSchema, remindDebtSchema } from "@daljir/validation";
import type { DebtStatus, InvoiceStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { recalculateCustomerBalance } from "./credit.service.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { money, serializeDebt, serializeDebtPayment, serializeInvoice } from "./serialize.js";
import { calendarDaysBetweenInTimezone, dayBoundsInTimezone, resolveBusinessTimezone } from "./timezone.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

function toDecimal(value: Prisma.Decimal | string | number) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export async function listDebts(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  const status = typeof req.query.status === "string" ? (req.query.status as DebtStatus) : undefined;
  const overdueOnly = req.query.overdueOnly === "true";
  const dueDateFrom = typeof req.query.dueDateFrom === "string" ? new Date(req.query.dueDateFrom) : undefined;
  const dueDateTo = typeof req.query.dueDateTo === "string" ? new Date(req.query.dueDateTo) : undefined;

  const where: Prisma.CustomerDebtWhereInput = {
    businessId: tenant.businessId,
    ...(customerId ? { customerId } : {}),
    ...(status ? { status } : {}),
    ...(overdueOnly ? { status: "OVERDUE" } : {}),
    ...(dueDateFrom || dueDateTo
      ? {
          dueDate: {
            ...(dueDateFrom ? { gte: dueDateFrom } : {}),
            ...(dueDateTo ? { lte: dueDateTo } : {}),
          },
        }
      : {}),
  };

  const [debts, total] = await Promise.all([
    prisma.customerDebt.findMany({
      where,
      orderBy: { dueDate: "asc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.customerDebt.count({ where }),
  ]);

  return sendData(res, debts.map(serializeDebt), 200, paginationMeta(pagination, total));
}

/**
 * Overdue is determined from the same business-timezone calendar-day
 * boundary as `listDueTodayDebts` and `getAgingReport`: a debt is overdue
 * when its `dueDate` is strictly before today's start in
 * `Business.timezone` and it is still open (not PAID/CANCELLED).
 *
 * The stored `CustomerDebt.status` field is still written by an out-of-
 * scope automation job, but this endpoint must not wait on that job —
 * otherwise a past-due debt that is still PENDING would be missing from
 * overdue while already sitting in aging's "1-30" bucket.
 */
export async function listOverdueDebts(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const timezone = await resolveBusinessTimezone(tenant.businessId);
  const { start: today } = dayBoundsInTimezone(new Date(), timezone);

  const debts = await prisma.customerDebt.findMany({
    where: {
      businessId: tenant.businessId,
      dueDate: { lt: today },
      status: { notIn: ["PAID", "CANCELLED"] },
    },
    orderBy: { dueDate: "asc" },
  });
  return sendData(res, debts.map(serializeDebt));
}

/**
 * "Today" is computed as the business's own calendar day (`Business.timezone`,
 * see `timezone.ts`), NOT the API server process's local time or UTC. A
 * debt due at 23:59 in Mogadishu must be classified as due today even if
 * the server's own clock (typically UTC) has already rolled past midnight.
 */
export async function listDueTodayDebts(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const timezone = await resolveBusinessTimezone(tenant.businessId);
  const { start: today, end: tomorrow } = dayBoundsInTimezone(new Date(), timezone);

  const debts = await prisma.customerDebt.findMany({
    where: {
      businessId: tenant.businessId,
      dueDate: { gte: today, lt: tomorrow },
      status: { notIn: ["PAID", "CANCELLED"] },
    },
    orderBy: { dueDate: "asc" },
  });
  return sendData(res, debts.map(serializeDebt));
}

/**
 * Bucketing uses the same business-timezone calendar-day boundary as
 * `listDueTodayDebts` (`calendarDaysBetweenInTimezone`), not a raw
 * millisecond division of `asOf - dueDate`. A raw division anchors "how
 * many days overdue" to the exact instant `asOf` was captured rather than
 * to calendar days, so a debt due at 23:59 today and re-checked at 00:01
 * tomorrow would previously show `daysOverdue = 0` ("current") when it is
 * actually one calendar day overdue. See `timezone.ts` for the full
 * rationale.
 */
export async function getAgingReport(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  const asOf = typeof req.query.asOf === "string" ? new Date(req.query.asOf) : new Date();
  const timezone = await resolveBusinessTimezone(tenant.businessId);

  const debts = await prisma.customerDebt.findMany({
    where: {
      businessId: tenant.businessId,
      status: { notIn: ["PAID", "CANCELLED"] },
      ...(customerId ? { customerId } : {}),
    },
    select: { outstandingAmount: true, dueDate: true },
  });

  const buckets = {
    current: { count: 0, total: new Prisma.Decimal(0) },
    "1-30": { count: 0, total: new Prisma.Decimal(0) },
    "31-60": { count: 0, total: new Prisma.Decimal(0) },
    "61-90": { count: 0, total: new Prisma.Decimal(0) },
    "90+": { count: 0, total: new Prisma.Decimal(0) },
  };

  let totalOutstanding = new Prisma.Decimal(0);

  for (const debt of debts) {
    const outstanding = toDecimal(debt.outstandingAmount);
    if (outstanding.lessThanOrEqualTo(0)) {
      continue;
    }
    totalOutstanding = totalOutstanding.plus(outstanding);

    const daysOverdue = calendarDaysBetweenInTimezone(debt.dueDate, asOf, timezone);
    let bucketKey: keyof typeof buckets;
    if (daysOverdue <= 0) {
      bucketKey = "current";
    } else if (daysOverdue <= 30) {
      bucketKey = "1-30";
    } else if (daysOverdue <= 60) {
      bucketKey = "31-60";
    } else if (daysOverdue <= 90) {
      bucketKey = "61-90";
    } else {
      bucketKey = "90+";
    }

    buckets[bucketKey].count += 1;
    buckets[bucketKey].total = buckets[bucketKey].total.plus(outstanding);
  }

  return sendData(res, {
    asOf: asOf.toISOString(),
    buckets: {
      current: { count: buckets.current.count, total: buckets.current.total.toFixed(2) },
      "1-30": { count: buckets["1-30"].count, total: buckets["1-30"].total.toFixed(2) },
      "31-60": { count: buckets["31-60"].count, total: buckets["31-60"].total.toFixed(2) },
      "61-90": { count: buckets["61-90"].count, total: buckets["61-90"].total.toFixed(2) },
      "90+": { count: buckets["90+"].count, total: buckets["90+"].total.toFixed(2) },
    },
    totalOutstanding: totalOutstanding.toFixed(2),
  });
}

export async function getDebt(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const debt = await prisma.customerDebt.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: {
      payments: { orderBy: { paidAt: "desc" } },
      invoice: true,
      customer: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  });
  if (!debt) {
    throw notFound("Debt not found");
  }

  return sendData(res, {
    ...serializeDebt(debt),
    payments: debt.payments.map(serializeDebtPayment),
    invoice: serializeInvoice(debt.invoice),
    customer: debt.customer,
  });
}

export async function recordDebtPayment(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createDebtPaymentSchema.parse(req.body);
  const debtId = req.params.id as string;

  const result = await prisma.$transaction(async (tx) => {
    const debt = await tx.customerDebt.findFirst({
      where: { id: debtId, businessId: tenant.businessId },
      include: { invoice: true },
    });
    if (!debt) {
      throw notFound("Debt not found");
    }
    if (debt.status === "PAID" || debt.status === "CANCELLED") {
      throw conflict("This debt is already settled and cannot accept further payments");
    }

    const paymentAmount = toDecimal(input.amount);
    const outstanding = toDecimal(debt.outstandingAmount);
    if (paymentAmount.greaterThan(outstanding)) {
      throw conflict(
        `Payment of ${paymentAmount.toFixed(2)} exceeds the outstanding balance of ${outstanding.toFixed(2)}`,
      );
    }

    const newAmountPaid = toDecimal(debt.amountPaid).plus(paymentAmount);
    const newOutstanding = toDecimal(debt.principalAmount).minus(newAmountPaid);
    const newDebtStatus: DebtStatus = newOutstanding.lessThanOrEqualTo(0) ? "PAID" : "PARTIALLY_PAID";

    const debtPayment = await tx.debtPayment.create({
      data: {
        businessId: tenant.businessId,
        debtId: debt.id,
        amount: paymentAmount,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        collectedById: auth.userId,
        paidAt: input.paidAt ?? new Date(),
      },
    });

    const updatedDebt = await tx.customerDebt.update({
      where: { id: debt.id },
      data: {
        amountPaid: newAmountPaid,
        outstandingAmount: newOutstanding.lessThanOrEqualTo(0) ? new Prisma.Decimal(0) : newOutstanding,
        status: newDebtStatus,
      },
    });

    const invoiceNewAmountPaid = toDecimal(debt.invoice.amountPaid).plus(paymentAmount);
    const invoiceNewAmountDue = toDecimal(debt.invoice.amountDue).minus(paymentAmount);
    const invoiceFullyPaid = invoiceNewAmountDue.lessThanOrEqualTo(0);
    const invoiceStatus: InvoiceStatus = invoiceFullyPaid ? "PAID" : "PARTIALLY_PAID";

    const updatedInvoice = await tx.invoice.update({
      where: { id: debt.invoiceId },
      data: {
        amountPaid: invoiceNewAmountPaid,
        amountDue: invoiceFullyPaid ? new Prisma.Decimal(0) : invoiceNewAmountDue,
        status: invoiceStatus,
        paidAt: invoiceFullyPaid ? new Date() : debt.invoice.paidAt,
      },
    });

    const payment = await tx.payment.create({
      data: {
        businessId: tenant.businessId,
        invoiceId: debt.invoiceId,
        customerId: debt.customerId,
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
        invoiceId: debt.invoiceId,
        debtId: debt.id,
        amount: paymentAmount,
      },
    });

    const balance = await recalculateCustomerBalance(tx, {
      businessId: tenant.businessId,
      customerId: debt.customerId,
    });

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "debt.payment_collected",
        entityType: "CustomerDebt",
        entityId: debt.id,
        metadata: {
          amount: money(paymentAmount),
          newOutstanding: money(updatedDebt.outstandingAmount),
          newStatus: newDebtStatus,
        },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { debtPayment, debt: updatedDebt, invoice: updatedInvoice, currentBalance: balance.currentBalance };
  });

  return sendData(
    res,
    {
      payment: serializeDebtPayment(result.debtPayment),
      debt: serializeDebt(result.debt),
      invoice: serializeInvoice(result.invoice),
      customerCurrentBalance: result.currentBalance,
    },
    201,
  );
}

export async function remindDebt(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = remindDebtSchema.parse(req.body);
  const debtId = req.params.id as string;

  const debt = await prisma.customerDebt.findFirst({
    where: { id: debtId, businessId: tenant.businessId },
  });
  if (!debt) {
    throw notFound("Debt not found");
  }
  if (toDecimal(debt.outstandingAmount).lessThanOrEqualTo(0)) {
    throw conflict("This debt has no outstanding balance to remind about");
  }

  const channel = input.channel ?? "IN_APP";
  const title = `Debt Reminder — ${debt.id}`;
  const timezone = await resolveBusinessTimezone(tenant.businessId);
  const { start: today } = dayBoundsInTimezone(new Date(), timezone);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.notification.findFirst({
      where: {
        businessId: tenant.businessId,
        customerId: debt.customerId,
        title,
        createdAt: { gte: today },
      },
      include: { logs: true },
    });

    if (existing) {
      return { notification: existing, duplicated: true };
    }

    const body =
      input.message ??
      `Reminder: an outstanding balance of ${money(debt.outstandingAmount)} is due on ${debt.dueDate.toISOString().slice(0, 10)}.`;

    const notification = await tx.notification.create({
      data: {
        businessId: tenant.businessId,
        customerId: debt.customerId,
        channel,
        title,
        body,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    await tx.notificationLog.create({
      data: {
        businessId: tenant.businessId,
        notificationId: notification.id,
        channel,
        provider: "internal",
        status: "SENT",
        deliveredAt: new Date(),
      },
    });

    await tx.customerDebt.update({
      where: { id: debt.id },
      data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() },
    });

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "debt.reminder_sent",
        entityType: "CustomerDebt",
        entityId: debt.id,
        metadata: { channel },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { notification, duplicated: false };
  });

  return sendData(
    res,
    {
      debtId: debt.id,
      notificationId: result.notification.id,
      duplicated: result.duplicated,
    },
    result.duplicated ? 200 : 201,
  );
}
