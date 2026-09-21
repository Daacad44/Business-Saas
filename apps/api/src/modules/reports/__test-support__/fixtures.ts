import type { Express } from "express";
import request from "supertest";
import { hashPassword } from "../../../lib/password.js";
import { prisma } from "../../../lib/prisma.js";

export function uniqueEmail(label: string) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@daljir.test`.toLowerCase();
}

export function uniqueCode(label: string) {
  return `${label}${Math.random().toString(36).slice(2, 8)}`.toUpperCase().slice(0, 20);
}

export const TEST_PASSWORD = "CorrectHorse-1";

export async function registerAndOnboard(app: Express, label: string) {
  const email = uniqueEmail(label);
  const agent = request.agent(app);
  const register = await agent.post("/api/v1/auth/register").send({
    fullName: label,
    email,
    password: TEST_PASSWORD,
  });
  if (register.status !== 201) {
    throw new Error(`registerAndOnboard: register failed: ${JSON.stringify(register.body)}`);
  }

  const onboard = await agent.post("/api/v1/businesses").send({
    name: `${label} Trading`,
    type: "RETAIL",
    locale: "en",
    branch: { name: "Main", code: uniqueCode("BR") },
    warehouse: { name: "Main warehouse", code: uniqueCode("WH") },
  });
  if (onboard.status !== 201) {
    throw new Error(`registerAndOnboard: onboard failed: ${JSON.stringify(onboard.body)}`);
  }

  return {
    agent,
    email,
    userId: register.body.data.user.id as string,
    businessId: onboard.body.data.business.id as string,
    branchId: onboard.body.data.branch.id as string,
    warehouseId: onboard.body.data.warehouse.id as string,
  };
}

/**
 * Creates a second membership on an already-onboarded business with the
 * given system role slug (e.g. "cashier", which lacks reports.read), and
 * logs that user in via a fresh supertest agent.
 */
export async function addMemberWithRole(app: Express, businessId: string, roleSlug: string, label: string) {
  const email = uniqueEmail(label);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: label, status: "ACTIVE" },
  });
  const role = await prisma.role.findFirstOrThrow({ where: { businessId, slug: roleSlug } });
  await prisma.membership.create({
    data: { businessId, userId: user.id, roleId: role.id, status: "ACTIVE" },
  });

  const agent = request.agent(app);
  const login = await agent.post("/api/v1/auth/login").send({ email, password: TEST_PASSWORD });
  if (login.status !== 200) {
    throw new Error(`addMemberWithRole: login failed: ${JSON.stringify(login.body)}`);
  }

  return { agent, userId: user.id, email };
}

export async function createProduct(
  businessId: string,
  overrides: Partial<{
    name: string;
    sku: string;
    costPrice: number;
    sellingPrice: number;
    lowStockThreshold: number | null;
  }> = {},
) {
  return prisma.product.create({
    data: {
      businessId,
      name: overrides.name ?? `Product ${uniqueCode("P")}`,
      sku: overrides.sku ?? uniqueCode("SKU"),
      costPrice: overrides.costPrice ?? 10,
      sellingPrice: overrides.sellingPrice ?? 20,
      lowStockThreshold: overrides.lowStockThreshold ?? null,
    },
  });
}

export async function createWarehouse(businessId: string, branchId: string, overrides: Partial<{ name: string; code: string }> = {}) {
  return prisma.warehouse.create({
    data: {
      businessId,
      branchId,
      name: overrides.name ?? `Warehouse ${uniqueCode("W")}`,
      code: overrides.code ?? uniqueCode("WH"),
    },
  });
}

export async function createProductVariant(
  businessId: string,
  productId: string,
  overrides: Partial<{ name: string; sku: string; costPrice: number; sellingPrice: number }> = {},
) {
  return prisma.productVariant.create({
    data: {
      businessId,
      productId,
      name: overrides.name ?? `Variant ${uniqueCode("V")}`,
      sku: overrides.sku ?? uniqueCode("VSKU"),
      costPrice: overrides.costPrice ?? 10,
      sellingPrice: overrides.sellingPrice ?? 20,
    },
  });
}

export async function createCustomer(
  businessId: string,
  overrides: Partial<{ fullName: string; phone: string }> = {},
) {
  return prisma.customer.create({
    data: {
      businessId,
      fullName: overrides.fullName ?? `Customer ${uniqueCode("C")}`,
      phone: overrides.phone ?? `+2526${Math.floor(Math.random() * 1e7)}`,
    },
  });
}

export async function createSupplier(businessId: string, overrides: Partial<{ name: string }> = {}) {
  return prisma.supplier.create({
    data: {
      businessId,
      name: overrides.name ?? `Supplier ${uniqueCode("S")}`,
    },
  });
}

export async function createStockLevel(params: {
  businessId: string;
  warehouseId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  reorderLevel?: number | null;
}) {
  return prisma.stockLevel.create({
    data: {
      businessId: params.businessId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      variantId: params.variantId ?? null,
      quantity: params.quantity,
      reorderLevel: params.reorderLevel ?? null,
    },
  });
}

export async function createBatch(params: {
  businessId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  expiryDate?: Date | null;
  batchNumber?: string;
  costPrice?: number;
}) {
  return prisma.batch.create({
    data: {
      businessId: params.businessId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      quantity: params.quantity,
      expiryDate: params.expiryDate ?? null,
      batchNumber: params.batchNumber ?? uniqueCode("BATCH"),
      costPrice: params.costPrice ?? null,
    },
  });
}

export async function createStockMovement(params: {
  businessId: string;
  warehouseId: string;
  productId: string;
  type:
    | "PURCHASE_IN"
    | "SALE_OUT"
    | "ADJUSTMENT_IN"
    | "ADJUSTMENT_OUT"
    | "TRANSFER_IN"
    | "TRANSFER_OUT"
    | "RETURN_IN"
    | "RETURN_OUT"
    | "OPENING_BALANCE";
  quantity: number;
  createdAt?: Date;
}) {
  return prisma.stockMovement.create({
    data: {
      businessId: params.businessId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      type: params.type,
      quantity: params.quantity,
      createdAt: params.createdAt ?? new Date(),
    },
  });
}

type SaleItemSeed = {
  productId: string;
  quantity: number;
  unitPrice: number;
  costPriceSnapshot?: number;
};

/** Seeds a COMPLETED cash sale (no invoice/debt) directly via Prisma. Used to test sales/profit/inventory reports without depending on a sibling POS module. */
export async function seedCashSale(params: {
  businessId: string;
  branchId: string;
  warehouseId: string;
  customerId?: string | null;
  soldAt: Date;
  items: SaleItemSeed[];
  discountAmount?: number;
  taxAmount?: number;
}) {
  const subtotal = params.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountAmount = params.discountAmount ?? 0;
  const taxAmount = params.taxAmount ?? 0;
  const totalAmount = subtotal - discountAmount + taxAmount;

  const sale = await prisma.sale.create({
    data: {
      businessId: params.businessId,
      branchId: params.branchId,
      warehouseId: params.warehouseId,
      customerId: params.customerId ?? null,
      saleNumber: uniqueCode("SALE"),
      type: "CASH",
      status: "COMPLETED",
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      soldAt: params.soldAt,
      createdAt: params.soldAt,
    },
  });

  for (const item of params.items) {
    await prisma.saleItem.create({
      data: {
        businessId: params.businessId,
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalAmount: item.unitPrice * item.quantity,
        costPriceSnapshot: item.costPriceSnapshot ?? null,
      },
    });
  }

  return sale;
}

/** Seeds a COMPLETED credit sale with an issued invoice and open CustomerDebt. */
export async function seedCreditSaleWithDebt(params: {
  businessId: string;
  branchId: string;
  warehouseId: string;
  customerId: string;
  soldAt: Date;
  dueDate: Date;
  items: SaleItemSeed[];
  amountPaid?: number;
}) {
  const subtotal = params.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const totalAmount = subtotal;
  const amountPaid = params.amountPaid ?? 0;
  const amountDue = totalAmount - amountPaid;

  const sale = await prisma.sale.create({
    data: {
      businessId: params.businessId,
      branchId: params.branchId,
      warehouseId: params.warehouseId,
      customerId: params.customerId,
      saleNumber: uniqueCode("SALE"),
      type: "CREDIT",
      status: "COMPLETED",
      subtotal,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount,
      soldAt: params.soldAt,
      createdAt: params.soldAt,
    },
  });

  for (const item of params.items) {
    await prisma.saleItem.create({
      data: {
        businessId: params.businessId,
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalAmount: item.unitPrice * item.quantity,
        costPriceSnapshot: item.costPriceSnapshot ?? null,
      },
    });
  }

  const invoice = await prisma.invoice.create({
    data: {
      businessId: params.businessId,
      saleId: sale.id,
      customerId: params.customerId,
      invoiceNumber: uniqueCode("INV"),
      status: amountDue <= 0 ? "PAID" : "ISSUED",
      subtotal,
      totalAmount,
      amountPaid,
      amountDue,
      dueDate: params.dueDate,
      issuedAt: params.soldAt,
    },
  });

  const debt = await prisma.customerDebt.create({
    data: {
      businessId: params.businessId,
      customerId: params.customerId,
      invoiceId: invoice.id,
      principalAmount: totalAmount,
      amountPaid,
      outstandingAmount: amountDue,
      dueDate: params.dueDate,
      status: amountDue <= 0 ? "PAID" : "PENDING",
    },
  });

  return { sale, invoice, debt };
}

export async function createPayment(params: {
  businessId: string;
  invoiceId?: string | null;
  customerId?: string | null;
  amount: number;
  method?: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CARD" | "CREDIT_NOTE" | "OTHER";
  paidAt: Date;
}) {
  return prisma.payment.create({
    data: {
      businessId: params.businessId,
      invoiceId: params.invoiceId ?? null,
      customerId: params.customerId ?? null,
      amount: params.amount,
      method: params.method ?? "CASH",
      status: "COMPLETED",
      paidAt: params.paidAt,
    },
  });
}

export async function createDebtPayment(params: {
  businessId: string;
  debtId: string;
  amount: number;
  method?: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CARD" | "CREDIT_NOTE" | "OTHER";
  paidAt: Date;
}) {
  return prisma.debtPayment.create({
    data: {
      businessId: params.businessId,
      debtId: params.debtId,
      amount: params.amount,
      method: params.method ?? "CASH",
      paidAt: params.paidAt,
    },
  });
}

export async function createPurchase(params: {
  businessId: string;
  supplierId: string;
  warehouseId: string;
  receivedAt: Date;
  items: Array<{ productId: string; quantity: number; unitCost: number }>;
}) {
  const subtotal = params.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
  const purchase = await prisma.purchase.create({
    data: {
      businessId: params.businessId,
      supplierId: params.supplierId,
      warehouseId: params.warehouseId,
      purchaseNumber: uniqueCode("PO"),
      status: "COMPLETED",
      subtotal,
      totalAmount: subtotal,
      amountPaid: 0,
      amountDue: subtotal,
      receivedAt: params.receivedAt,
      createdAt: params.receivedAt,
    },
  });

  for (const item of params.items) {
    await prisma.purchaseItem.create({
      data: {
        businessId: params.businessId,
        purchaseId: purchase.id,
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.unitCost * item.quantity,
      },
    });
  }

  return purchase;
}

export async function createExpenseCategory(businessId: string, name?: string) {
  return prisma.expenseCategory.create({
    data: { businessId, name: name ?? `Category ${uniqueCode("EC")}` },
  });
}

export async function createExpense(params: {
  businessId: string;
  categoryId: string;
  amount: number;
  expenseDate: Date;
  description?: string;
}) {
  return prisma.expense.create({
    data: {
      businessId: params.businessId,
      categoryId: params.categoryId,
      amount: params.amount,
      description: params.description ?? "Expense",
      expenseDate: params.expenseDate,
    },
  });
}
