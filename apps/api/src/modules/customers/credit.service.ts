import { Prisma } from "@prisma/client";
import { overdueDebtWhere, resolveBusinessTimezone } from "./timezone.js";

export type CreditCheckResult = {
  allowed: boolean;
  creditLimit: string;
  currentBalance: string;
  availableCredit: string;
  reason?: "CUSTOMER_NOT_FOUND" | "CUSTOMER_DISABLED" | "LIMIT_EXCEEDED" | "OVERDUE_DEBT";
};

const ZERO = new Prisma.Decimal(0);

function toDecimal(value: Prisma.Decimal | string | number) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Safe to call inside an existing prisma.$transaction by passing tx. */
export async function checkCreditEligibility(
  tx: Prisma.TransactionClient,
  args: { businessId: string; customerId: string; amount: Prisma.Decimal | string },
): Promise<CreditCheckResult> {
  const customer = await tx.customer.findFirst({
    where: { id: args.customerId, businessId: args.businessId },
  });

  if (!customer) {
    return {
      allowed: false,
      creditLimit: ZERO.toFixed(2),
      currentBalance: ZERO.toFixed(2),
      availableCredit: ZERO.toFixed(2),
      reason: "CUSTOMER_NOT_FOUND",
    };
  }

  const creditLimit = toDecimal(customer.creditLimit);
  const currentBalance = toDecimal(customer.currentBalance);
  const availableCredit = creditLimit.minus(currentBalance);

  if (customer.status !== "ACTIVE") {
    return {
      allowed: false,
      creditLimit: creditLimit.toFixed(2),
      currentBalance: currentBalance.toFixed(2),
      availableCredit: availableCredit.toFixed(2),
      reason: "CUSTOMER_DISABLED",
    };
  }

  const timezone = await resolveBusinessTimezone(args.businessId, tx);
  const overdueDebt = await tx.customerDebt.findFirst({
    where: {
      businessId: args.businessId,
      customerId: args.customerId,
      ...overdueDebtWhere(new Date(), timezone),
    },
    select: { id: true },
  });
  if (overdueDebt) {
    return {
      allowed: false,
      creditLimit: creditLimit.toFixed(2),
      currentBalance: currentBalance.toFixed(2),
      availableCredit: availableCredit.toFixed(2),
      reason: "OVERDUE_DEBT",
    };
  }

  const amount = toDecimal(args.amount);
  if (amount.greaterThan(availableCredit)) {
    return {
      allowed: false,
      creditLimit: creditLimit.toFixed(2),
      currentBalance: currentBalance.toFixed(2),
      availableCredit: availableCredit.toFixed(2),
      reason: "LIMIT_EXCEEDED",
    };
  }

  return {
    allowed: true,
    creditLimit: creditLimit.toFixed(2),
    currentBalance: currentBalance.toFixed(2),
    availableCredit: availableCredit.toFixed(2),
  };
}

/** Recomputes Customer.currentBalance from CustomerDebt rows. Must run inside a transaction. */
export async function recalculateCustomerBalance(
  tx: Prisma.TransactionClient,
  args: { businessId: string; customerId: string },
): Promise<{ currentBalance: string }> {
  const debts = await tx.customerDebt.findMany({
    where: {
      businessId: args.businessId,
      customerId: args.customerId,
      status: { not: "CANCELLED" },
    },
    select: { outstandingAmount: true },
  });

  const total = debts.reduce(
    (sum, debt) => sum.plus(toDecimal(debt.outstandingAmount)),
    new Prisma.Decimal(0),
  );

  const customer = await tx.customer.update({
    where: { id: args.customerId },
    data: { currentBalance: total },
    select: { currentBalance: true },
  });

  return { currentBalance: toDecimal(customer.currentBalance).toFixed(2) };
}
