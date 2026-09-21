import { Prisma, type StockMovementType } from "@prisma/client";
import { conflict } from "../../lib/errors.js";

export type StockMovementInput = {
  businessId: string;
  warehouseId: string;
  productId: string;
  variantId?: string | null;
  batchId?: string | null;
  type: StockMovementType;
  quantity: Prisma.Decimal | string;
  unitCost?: Prisma.Decimal | string | null;
  referenceType: string;
  referenceId: string;
  notes?: string | null;
  createdById: string;
};

function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * SIGN CONVENTION (read this before calling `applyStockMovement`):
 *
 * `quantity` is SIGNED relative to the warehouse's StockLevel.quantity:
 *   - Positive quantity INCREASES stock (PURCHASE_IN, ADJUSTMENT_IN,
 *     TRANSFER_IN, RETURN_IN, OPENING_BALANCE).
 *   - Negative quantity DECREASES stock (SALE_OUT, ADJUSTMENT_OUT,
 *     TRANSFER_OUT, RETURN_OUT).
 *
 * The `StockMovement.quantity` column always stores this same signed value,
 * so `SUM(quantity)` per `(businessId, warehouseId, productId, variantId)`
 * must always equal the corresponding `StockLevel.quantity` row. This is the
 * ledger invariant: it must be impossible to reach a `StockLevel` value that
 * disagrees with the sum of its `StockMovement` rows, and it must be
 * impossible to create a `StockMovement` without this function updating the
 * matching `StockLevel`.
 *
 * CONCURRENCY STRATEGY: this function takes a Postgres transaction-scoped
 * advisory lock (`pg_advisory_xact_lock`) keyed by a hash of
 * `(businessId, warehouseId, productId, variantId)` before reading/writing
 * the `StockLevel` row. This serializes concurrent movements against the
 * exact same stock line (regardless of whether the `StockLevel` row already
 * exists), which closes both the "two concurrent decrements drive stock
 * negative" race and the "two concurrent first-time inserts create duplicate
 * StockLevel rows" race, without requiring a stricter table/database-wide
 * isolation level. The lock is automatically released when the enclosing
 * `prisma.$transaction` commits or rolls back.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  input: StockMovementInput,
): Promise<{ id: string }> {
  const quantity = toDecimal(input.quantity);
  const unitCost = input.unitCost != null ? toDecimal(input.unitCost) : null;
  const variantId = input.variantId ?? null;
  const batchId = input.batchId ?? null;

  await lockStockLine(tx, {
    businessId: input.businessId,
    warehouseId: input.warehouseId,
    productId: input.productId,
    variantId,
  });

  const existing = await tx.stockLevel.findFirst({
    where: {
      businessId: input.businessId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId,
    },
  });

  const currentQuantity = existing?.quantity ?? new Prisma.Decimal(0);
  const nextQuantity = currentQuantity.add(quantity);

  if (nextQuantity.isNegative()) {
    throw conflict("This movement would drive stock below zero");
  }

  const movement = await tx.stockMovement.create({
    data: {
      businessId: input.businessId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId,
      batchId,
      type: input.type,
      quantity,
      unitCost,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      notes: input.notes ?? null,
      performedById: input.createdById,
    },
    select: { id: true },
  });

  if (existing) {
    await tx.stockLevel.update({
      where: { id: existing.id },
      data: { quantity: nextQuantity },
    });
  } else {
    await tx.stockLevel.create({
      data: {
        businessId: input.businessId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        variantId,
        quantity: nextQuantity,
      },
    });
  }

  return { id: movement.id };
}

/**
 * Preflight check used before building an outbound movement (sale, transfer
 * dispatch, negative adjustment, etc). `quantity` is the POSITIVE amount the
 * caller intends to remove from the warehouse. Available stock is computed
 * as `StockLevel.quantity - StockLevel.reservedQuantity`. Throws a 409
 * domain error when the requested quantity is not available.
 *
 * This is a convenience/fail-fast check — the authoritative guarantee
 * against negative stock is still enforced by `applyStockMovement` itself
 * (under the same advisory lock) at the moment the movement is written.
 */
export async function assertSufficientStock(
  tx: Prisma.TransactionClient,
  args: {
    businessId: string;
    warehouseId: string;
    productId: string;
    variantId?: string | null;
    quantity: Prisma.Decimal | string;
  },
): Promise<void> {
  const required = toDecimal(args.quantity);
  if (required.lte(0)) {
    return;
  }

  const variantId = args.variantId ?? null;
  const level = await tx.stockLevel.findFirst({
    where: {
      businessId: args.businessId,
      warehouseId: args.warehouseId,
      productId: args.productId,
      variantId,
    },
  });

  const available = (level?.quantity ?? new Prisma.Decimal(0)).minus(
    level?.reservedQuantity ?? new Prisma.Decimal(0),
  );

  if (available.lt(required)) {
    throw conflict("Insufficient stock available for this operation");
  }
}

async function lockStockLine(
  tx: Prisma.TransactionClient,
  key: { businessId: string; warehouseId: string; productId: string; variantId: string | null },
) {
  const lockKey = `stock:${key.businessId}:${key.warehouseId}:${key.productId}:${key.variantId ?? "none"}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}
