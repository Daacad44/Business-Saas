import { prisma } from "../lib/prisma.js";

export function uniqueSuffix(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export type TestTenant = {
  businessId: string;
  branchId: string;
  warehouseId: string;
};

export async function createTestTenant(label: string, overrides: { email?: string; phone?: string } = {}): Promise<TestTenant> {
  const suffix = uniqueSuffix();
  const business = await prisma.business.create({
    data: {
      name: `${label} Trading ${suffix}`,
      slug: `${label.toLowerCase()}-${suffix}`,
      type: "RETAIL",
      email: overrides.email ?? `${label.toLowerCase()}.${suffix}@daljir.test`,
      phone: overrides.phone ?? `2521${suffix}`.slice(0, 15),
    },
  });
  const branch = await prisma.branch.create({
    data: { businessId: business.id, name: "Main", code: `MAIN-${suffix}` },
  });
  const warehouse = await prisma.warehouse.create({
    data: { businessId: business.id, branchId: branch.id, name: "Main warehouse", code: `WH-${suffix}` },
  });
  return { businessId: business.id, branchId: branch.id, warehouseId: warehouse.id };
}

export async function createTestProduct(
  businessId: string,
  overrides: { lowStockThreshold?: number | null; trackStock?: boolean } = {},
) {
  const suffix = uniqueSuffix();
  return prisma.product.create({
    data: {
      businessId,
      name: `Test Product ${suffix}`,
      sku: `SKU-${suffix}`,
      sellingPrice: 10,
      costPrice: 5,
      trackStock: overrides.trackStock ?? true,
      lowStockThreshold: overrides.lowStockThreshold === undefined ? 5 : overrides.lowStockThreshold,
    },
  });
}

export async function createTestVariant(businessId: string, productId: string) {
  const suffix = uniqueSuffix();
  return prisma.productVariant.create({
    data: {
      businessId,
      productId,
      name: `Variant ${suffix}`,
      sku: `VAR-${suffix}`,
      sellingPrice: 12,
      costPrice: 6,
    },
  });
}

export async function createStockLevel(
  businessId: string,
  warehouseId: string,
  productId: string,
  quantity: number,
  options: { variantId?: string | null; reorderLevel?: number | null } = {},
) {
  return prisma.stockLevel.create({
    data: {
      businessId,
      warehouseId,
      productId,
      variantId: options.variantId ?? null,
      quantity,
      reorderLevel: options.reorderLevel ?? null,
    },
  });
}

export async function createLowStockRule(businessId: string, actionType: "SEND_SMS" | "SEND_EMAIL" | "CREATE_NOTIFICATION" = "CREATE_NOTIFICATION") {
  const suffix = uniqueSuffix();
  const rule = await prisma.automationRule.create({
    data: { businessId, name: `Low stock rule ${suffix}`, isActive: true },
  });
  const trigger = await prisma.automationTrigger.create({
    data: { businessId, ruleId: rule.id, type: "LOW_STOCK" },
  });
  await prisma.automationAction.create({
    data: { businessId, ruleId: rule.id, type: actionType, order: 0 },
  });
  return { rule, trigger };
}
