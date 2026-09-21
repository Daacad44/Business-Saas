import { prisma } from "../lib/prisma.js";
import { applyStockMovement } from "../modules/inventory/stock.service.js";

let productCounter = 0;

export async function createProduct(args: {
  businessId: string;
  sellingPrice: string;
  costPrice?: string;
  taxRate?: string;
  sku?: string;
}) {
  productCounter += 1;
  const suffix = `${Date.now()}-${productCounter}-${Math.random().toString(36).slice(2, 6)}`;
  return prisma.product.create({
    data: {
      businessId: args.businessId,
      name: `Test Product ${suffix}`,
      sku: args.sku ?? `SKU-${suffix}`,
      sellingPrice: args.sellingPrice,
      costPrice: args.costPrice ?? "0",
      taxRate: args.taxRate ?? "0",
    },
  });
}

/** Seeds initial stock via a real OPENING_BALANCE StockMovement, never by writing StockLevel directly. */
export async function setStock(args: {
  businessId: string;
  warehouseId: string;
  productId: string;
  quantity: string;
  userId: string;
}) {
  return prisma.$transaction((tx) =>
    applyStockMovement(tx, {
      businessId: args.businessId,
      warehouseId: args.warehouseId,
      productId: args.productId,
      type: "OPENING_BALANCE",
      quantity: args.quantity,
      referenceType: "OPENING_BALANCE",
      referenceId: args.productId,
      createdById: args.userId,
    }),
  );
}
