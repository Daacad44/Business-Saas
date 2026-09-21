import type { AutomationTrigger, CustomerDebt } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const NON_ACTIONABLE_DEBT_STATUSES = ["PAID", "CANCELLED"] as const;

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Finds `CustomerDebt` rows matching a given trigger for a single business.
 * Scoped strictly to `businessId` — never crosses tenant boundaries.
 * Mirrors `apps/api/src/modules/automation/trigger-evaluator.ts`.
 */
export async function findMatchingDebts(
  businessId: string,
  trigger: Pick<AutomationTrigger, "type" | "offsetDays">,
  debtId?: string,
): Promise<CustomerDebt[]> {
  const today = startOfDay(new Date());

  const baseWhere = {
    businessId,
    ...(debtId ? { id: debtId } : {}),
    outstandingAmount: { gt: 0 },
    status: { notIn: [...NON_ACTIONABLE_DEBT_STATUSES] },
  };

  switch (trigger.type) {
    case "MANUAL": {
      if (!debtId) return [];
      return prisma.customerDebt.findMany({ where: baseWhere });
    }
    case "INVOICE_DUE_SOON": {
      const offset = trigger.offsetDays ?? 3;
      const targetDate = addDays(today, offset);
      const targetEnd = addDays(targetDate, 1);
      return prisma.customerDebt.findMany({
        where: { ...baseWhere, dueDate: { gte: targetDate, lt: targetEnd } },
      });
    }
    case "INVOICE_DUE_TODAY": {
      const tomorrow = addDays(today, 1);
      return prisma.customerDebt.findMany({
        where: { ...baseWhere, dueDate: { gte: today, lt: tomorrow } },
      });
    }
    case "INVOICE_OVERDUE": {
      return prisma.customerDebt.findMany({
        where: { ...baseWhere, dueDate: { lt: today } },
      });
    }
    case "LOW_STOCK":
    default:
      return [];
  }
}
