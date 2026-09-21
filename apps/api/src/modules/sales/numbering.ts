import type { Prisma } from "@prisma/client";

/**
 * CONCURRENCY STRATEGY for gap-free, per-business sequential numbers
 * (`Sale.saleNumber`, `Invoice.invoiceNumber`, `SalesReturn.returnNumber`):
 *
 * Each call takes a Postgres transaction-scoped advisory lock
 * (`pg_advisory_xact_lock`) keyed by a hash of `(businessId, kind)` before
 * counting existing rows of that kind for the business. Because the lock is
 * held for the lifetime of the enclosing `prisma.$transaction`, a second
 * concurrent transaction requesting a number for the same
 * `(businessId, kind)` blocks until the first transaction commits or rolls
 * back:
 *   - On commit, the count the second transaction observes already
 *     includes the first transaction's new row, so numbers are strictly
 *     increasing with no duplicates and no gaps.
 *   - On rollback, no row was inserted, so the number is naturally reused
 *     by the next transaction — no permanent gap is created.
 *
 * This mirrors the same advisory-lock pattern used by
 * `inventory/stock.service.ts` for stock-line serialization, and avoids
 * needing a dedicated counter table (out of scope: this module may not
 * modify `prisma/schema.prisma`).
 *
 * Callers that need more than one kind of number inside the same
 * transaction (e.g. sale then invoice) MUST always acquire them in the same
 * fixed order across the whole codebase to avoid a lock-order-inversion
 * deadlock. This module always generates in the order: sale, invoice,
 * return.
 */
export async function nextSequenceNumber(
  tx: Prisma.TransactionClient,
  args: { businessId: string; kind: "sale" | "invoice" | "return"; prefix: string },
): Promise<string> {
  const lockKey = `seq:${args.businessId}:${args.kind}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

  let count: number;
  if (args.kind === "sale") {
    count = await tx.sale.count({ where: { businessId: args.businessId } });
  } else if (args.kind === "invoice") {
    count = await tx.invoice.count({ where: { businessId: args.businessId } });
  } else {
    count = await tx.salesReturn.count({ where: { businessId: args.businessId } });
  }

  const next = count + 1;
  return `${args.prefix}-${String(next).padStart(6, "0")}`;
}
