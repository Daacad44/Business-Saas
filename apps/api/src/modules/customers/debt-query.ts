import type { ListDebtsQuery } from "@daljir/validation";
import type { DebtStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { debtStatusQueryWhere, overdueDebtWhere, resolveBusinessTimezone } from "./timezone.js";

export const DUE_SOON_FILTER_MESSAGE =
  "status=DUE_SOON is not a supported filter: there is no canonical due-soon window. Use status=DUE_TODAY or GET /debts/due-today for debts due on the business calendar day, or status=OVERDUE, overdueOnly=true, or GET /debts/overdue for past-due open debts.";

export type DebtListFilters = {
  businessId: string;
  customerId?: string;
  status?: ListDebtsQuery["status"];
  overdueOnly?: boolean;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  asOf?: Date;
};

/**
 * Shared `where` for GET /debts and GET /customers/:id/debts.
 *
 * Stored settlement statuses (PENDING, PARTIALLY_PAID, PAID, CANCELLED)
 * filter the column. OVERDUE / DUE_TODAY are aliases for the canonical
 * calendar predicates. DUE_SOON is rejected with 422 so a dropdown built
 * from the Prisma enum cannot silently return an empty list.
 *
 * Filters are composed with Prisma `AND` so `status=` and `overdueOnly`
 * cannot overwrite each other's `dueDate` / `status` clauses.
 */
export async function buildDebtListWhere(filters: DebtListFilters): Promise<Prisma.CustomerDebtWhereInput> {
  if (filters.status === "DUE_SOON") {
    throw new AppError(422, "VALIDATION_ERROR", DUE_SOON_FILTER_MESSAGE);
  }

  const asOf = filters.asOf ?? new Date();
  const needsCalendar =
    filters.status === "OVERDUE" || filters.status === "DUE_TODAY" || Boolean(filters.overdueOnly);
  const timezone = needsCalendar ? await resolveBusinessTimezone(filters.businessId) : undefined;

  const clauses: Prisma.CustomerDebtWhereInput[] = [];

  if (filters.status === "OVERDUE" || filters.status === "DUE_TODAY") {
    clauses.push(debtStatusQueryWhere(filters.status, asOf, timezone!));
  } else if (filters.status) {
    clauses.push({ status: filters.status as DebtStatus });
  }

  if (filters.overdueOnly) {
    clauses.push(overdueDebtWhere(asOf, timezone!));
  }

  if (filters.dueDateFrom || filters.dueDateTo) {
    clauses.push({
      dueDate: {
        ...(filters.dueDateFrom ? { gte: filters.dueDateFrom } : {}),
        ...(filters.dueDateTo ? { lte: filters.dueDateTo } : {}),
      },
    });
  }

  return {
    businessId: filters.businessId,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(clauses.length > 0 ? { AND: clauses } : {}),
  };
}
