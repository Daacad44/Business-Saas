import type { Prisma } from "@prisma/client";

/**
 * SEQUENTIAL NUMBERING & CONCURRENCY STRATEGY:
 *
 * Per-business document numbers (`Purchase.purchaseNumber`, `PurchaseOrder.orderNumber`,
 * `PurchaseReturn.returnNumber`) must be gap-free and unique under concurrent writers.
 *
 * We take a Postgres transaction-scoped advisory lock keyed by `(businessId, entity)`
 * BEFORE counting existing rows for that business, then derive the next number as
 * `count + 1`. The lock (`pg_advisory_xact_lock`) serializes concurrent transactions
 * that would otherwise race to compute the same "next" number — a second transaction
 * blocks until the first commits or rolls back, at which point it sees the up-to-date
 * count.
 *
 * Because the number is derived from a live count rather than a persistent counter,
 * a rolled-back transaction never "consumes" a number: if the enclosing
 * `prisma.$transaction` rolls back for any reason (validation failure, insufficient
 * stock, etc.), the row is never created and the next transaction will compute the
 * exact same number, so the sequence stays gap-free even in the presence of failed
 * attempts. The lock is released automatically when the transaction commits or
 * rolls back, so it never outlives the request.
 *
 * The `@@unique([businessId, <number column>])` constraint on each model is a
 * defense-in-depth backstop: if it were ever violated (e.g. a future code path bypasses
 * this helper), the insert fails loudly rather than silently duplicating a document
 * number.
 */
export async function nextSequenceNumber(
  tx: Prisma.TransactionClient,
  args: { businessId: string; entity: "PO" | "PUR" | "PRET"; count: () => Promise<number> },
): Promise<string> {
  const lockKey = `seq:${args.entity}:${args.businessId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const current = await args.count();
  return `${args.entity}-${String(current + 1).padStart(6, "0")}`;
}
