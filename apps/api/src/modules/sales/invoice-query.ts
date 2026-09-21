import type { ListInvoicesQuery } from "@daljir/validation";
import type { InvoiceStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { resolveBusinessTimezone, startOfDayInTimezone } from "../customers/timezone.js";

const ZERO = new Prisma.Decimal(0);

export type InvoiceListFilters = {
  businessId: string;
  customerId?: string;
  status?: ListInvoicesQuery["status"];
  overdueOnly?: boolean;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  asOf?: Date;
};

/**
 * An "open" invoice still has an outstanding balance. Money is compared as
 * `Prisma.Decimal` (never JS float). `PAID` / `VOID` are excluded because
 * those statuses ARE written by payment / settlement / void paths.
 *
 * Invoices have no `CANCELLED` member — `VOID` is the terminal analogue of
 * `CustomerDebt.status = CANCELLED`. `InvoiceStatus.OVERDUE` and `DRAFT`
 * are NOT part of this filter: nothing in the sales write path writes them,
 * so they must never be treated as source of truth.
 */
export function openOutstandingInvoiceWhere(): Prisma.InvoiceWhereInput {
  return {
    amountDue: { gt: ZERO },
    status: { notIn: ["PAID", "VOID"] },
  };
}

/**
 * Canonical overdue-invoice predicate — the single source of truth for
 * `GET /invoices?overdueOnly=true` and `GET /invoices?status=OVERDUE`.
 *
 * An invoice is overdue iff it still has an outstanding balance AND its
 * `dueDate` is strictly before the start of the calendar day containing
 * `asOf` in `timeZone` (the business timezone). The day boundary is the
 * same helper debts use (`startOfDayInTimezone`); do not invent a second
 * cut.
 *
 * Always apply this `where` in the database. Do not filter by stored
 * `InvoiceStatus.OVERDUE`. The query string `status=OVERDUE` is an alias
 * for this predicate, not a column match.
 */
export function overdueInvoiceWhere(asOf: Date, timeZone: string): Prisma.InvoiceWhereInput {
  return {
    ...openOutstandingInvoiceWhere(),
    dueDate: { lt: startOfDayInTimezone(asOf, timeZone) },
  };
}

/**
 * Shared `where` for GET /invoices.
 *
 * Stored settlement statuses (DRAFT, ISSUED, PARTIALLY_PAID, PAID, VOID)
 * filter the column. OVERDUE is an alias for the canonical calendar
 * predicate. Filters are composed with Prisma `AND` so `status=` and
 * `overdueOnly` cannot overwrite each other's `dueDate` / `status` clauses.
 */
export async function buildInvoiceListWhere(filters: InvoiceListFilters): Promise<Prisma.InvoiceWhereInput> {
  const asOf = filters.asOf ?? new Date();
  const needsCalendar = filters.status === "OVERDUE" || Boolean(filters.overdueOnly);
  const timezone = needsCalendar ? await resolveBusinessTimezone(filters.businessId) : undefined;

  const clauses: Prisma.InvoiceWhereInput[] = [];

  if (filters.status === "OVERDUE") {
    clauses.push(overdueInvoiceWhere(asOf, timezone!));
  } else if (filters.status) {
    clauses.push({ status: filters.status as InvoiceStatus });
  }

  if (filters.overdueOnly) {
    clauses.push(overdueInvoiceWhere(asOf, timezone!));
  }

  if (filters.search) {
    clauses.push({ invoiceNumber: { contains: filters.search, mode: "insensitive" } });
  }

  if (filters.dateFrom || filters.dateTo) {
    clauses.push({
      issuedAt: {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      },
    });
  }

  return {
    businessId: filters.businessId,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(clauses.length > 0 ? { AND: clauses } : {}),
  };
}
