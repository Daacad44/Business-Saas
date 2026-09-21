import { Prisma } from "@prisma/client";

export function toDecimal(value: Prisma.Decimal | string | number) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * Recomputes Supplier.currentBalance as the sum of `amountDue` across all
 * non-cancelled Purchases for that supplier. Must run inside a transaction so
 * the balance always reflects the state that will actually be committed.
 */
export async function recalculateSupplierBalance(
  tx: Prisma.TransactionClient,
  args: { businessId: string; supplierId: string },
): Promise<{ currentBalance: string }> {
  const purchases = await tx.purchase.findMany({
    where: {
      businessId: args.businessId,
      supplierId: args.supplierId,
      status: { not: "CANCELLED" },
    },
    select: { amountDue: true },
  });

  const total = purchases.reduce(
    (sum, purchase) => sum.plus(toDecimal(purchase.amountDue)),
    new Prisma.Decimal(0),
  );

  const supplier = await tx.supplier.update({
    where: { id: args.supplierId },
    data: { currentBalance: total },
    select: { currentBalance: true },
  });

  return { currentBalance: toDecimal(supplier.currentBalance).toFixed(2) };
}
