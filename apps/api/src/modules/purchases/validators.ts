import type { Prisma } from "@prisma/client";
import { notFound } from "../../lib/errors.js";

/**
 * CROSS-TENANT FK VALIDATION:
 *
 * Every foreign key that arrives in a request body (`supplierId`,
 * `warehouseId`, `productId`, `variantId`, `purchaseOrderId`,
 * `expenseCategoryId`, `branchId`, ...) is re-resolved against
 * `req.tenant.businessId` inside the same transaction that will use it. We
 * NEVER trust a caller-supplied id without a `findFirst({ where: { id,
 * businessId } })` check first. A row that exists but belongs to a
 * different business is indistinguishable from a row that does not exist:
 * both raise `notFound()` (404), never `forbidden()` (403), so an attacker
 * cannot use the response to enumerate other tenants' ids.
 */
export async function assertSupplierInBusiness(
  tx: Prisma.TransactionClient,
  businessId: string,
  supplierId: string,
) {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, businessId } });
  if (!supplier) {
    throw notFound("Supplier not found");
  }
  return supplier;
}

export async function assertWarehouseInBusiness(
  tx: Prisma.TransactionClient,
  businessId: string,
  warehouseId: string,
) {
  const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, businessId } });
  if (!warehouse) {
    throw notFound("Warehouse not found");
  }
  return warehouse;
}

export async function assertProductInBusiness(
  tx: Prisma.TransactionClient,
  businessId: string,
  productId: string,
  variantId?: string | null,
) {
  const product = await tx.product.findFirst({ where: { id: productId, businessId } });
  if (!product) {
    throw notFound("Product not found");
  }
  if (variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, businessId, productId },
    });
    if (!variant) {
      throw notFound("Product variant not found");
    }
    return { product, variant };
  }
  return { product, variant: null };
}

export async function assertPurchaseOrderInBusiness(
  tx: Prisma.TransactionClient,
  businessId: string,
  purchaseOrderId: string,
) {
  const order = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, businessId },
    include: { items: true },
  });
  if (!order) {
    throw notFound("Purchase order not found");
  }
  return order;
}

export async function assertBranchInBusiness(
  tx: Prisma.TransactionClient,
  businessId: string,
  branchId: string,
) {
  const branch = await tx.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) {
    throw notFound("Branch not found");
  }
  return branch;
}

export async function assertExpenseCategoryInBusiness(
  tx: Prisma.TransactionClient,
  businessId: string,
  categoryId: string,
) {
  const category = await tx.expenseCategory.findFirst({ where: { id: categoryId, businessId } });
  if (!category) {
    throw notFound("Expense category not found");
  }
  return category;
}
