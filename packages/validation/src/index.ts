import { z } from "zod";

export const businessTypeSchema = z.enum([
  "RETAIL",
  "WHOLESALE",
  "SUPERMARKET",
  "PHARMACY",
  "ELECTRONICS",
  "CLOTHING",
  "HARDWARE",
  "MOBILE",
  "AUTO_PARTS",
  "GENERAL_TRADING",
  "OTHER",
]);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(10).max(128),
  phone: z.string().trim().min(7).max(32).optional(),
  invitationToken: z.string().min(16).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: businessTypeSchema,
  phone: z.string().trim().min(7).max(32).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  currency: z.string().trim().length(3).default("USD"),
  timezone: z.string().trim().min(3).max(64).default("Africa/Mogadishu"),
  locale: z.enum(["en", "so"]).default("en"),
  branch: z.object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(1).max(32),
    address: z.string().trim().max(240).optional(),
    phone: z.string().trim().min(7).max(32).optional(),
  }),
  warehouse: z.object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(1).max(32),
  }),
});

export const updateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  type: businessTypeSchema.optional(),
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  email: z.string().trim().email().toLowerCase().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  locale: z.enum(["en", "so"]).optional(),
});

export const updateBusinessSettingsSchema = z.object({
  lowStockAlerts: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  roleId: z.string().min(1),
});

export const updateMembershipSchema = z.object({
  roleId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  permissionKeys: z.array(z.string().min(1)).min(1),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  permissionKeys: z.array(z.string().min(1)).min(1).optional(),
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(32),
  address: z.string().trim().max(240).optional(),
  phone: z.string().trim().min(7).max(32).optional(),
  isDefault: z.boolean().optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().min(1).max(32).optional(),
  address: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const createWarehouseSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(32),
  isDefault: z.boolean().optional(),
});

export const updateWarehouseSchema = z.object({
  branchId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().min(1).max(32).optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(16),
});

// =====================================================================
// PHASE 2 — INVENTORY
// =====================================================================

const money = () => z.number().finite().nonnegative();
const positiveMoney = () => z.number().finite().positive();
const quantity = () => z.number().finite().positive();
const nonNegativeQuantity = () => z.number().finite().nonnegative();

export const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(60),
  symbol: z.string().trim().min(1).max(16),
});

export const updateUnitSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  symbol: z.string().trim().min(1).max(16).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().min(1).optional(),
  description: z.string().trim().max(240).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().min(1).nullable().optional(),
  description: z.string().trim().max(240).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const createProductSchema = z.object({
  categoryId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(1000).optional(),
  costPrice: money().default(0),
  sellingPrice: positiveMoney(),
  taxRate: z.number().finite().min(0).max(100).default(0),
  trackStock: z.boolean().default(true),
  hasVariants: z.boolean().default(false),
  lowStockThreshold: nonNegativeQuantity().optional(),
});

export const updateProductSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  unitId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().min(1).max(64).optional(),
  barcode: z.string().trim().min(1).max(64).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  costPrice: money().optional(),
  sellingPrice: positiveMoney().optional(),
  taxRate: z.number().finite().min(0).max(100).optional(),
  trackStock: z.boolean().optional(),
  hasVariants: z.boolean().optional(),
  lowStockThreshold: nonNegativeQuantity().nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const createProductVariantSchema = z.object({
  productId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().min(1).max(64).optional(),
  costPrice: money().default(0),
  sellingPrice: positiveMoney(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const updateProductVariantSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().min(1).max(64).optional(),
  barcode: z.string().trim().min(1).max(64).nullable().optional(),
  costPrice: money().optional(),
  sellingPrice: positiveMoney().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const createBatchSchema = z.object({
  warehouseId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  batchNumber: z.string().trim().min(1).max(64),
  expiryDate: z.coerce.date().optional(),
  quantity: nonNegativeQuantity().default(0),
  costPrice: money().optional(),
});

export const stockAdjustmentItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantityDelta: z.number().finite().refine((value) => value !== 0, "quantityDelta must not be zero"),
  unitCost: money().optional(),
});

export const createStockAdjustmentSchema = z.object({
  warehouseId: z.string().min(1),
  reason: z.enum(["DAMAGE", "THEFT", "EXPIRY", "RECOUNT", "OTHER"]),
  reference: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(stockAdjustmentItemSchema).min(1),
});

export const stockTransferItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: quantity(),
});

export const createStockTransferSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  reference: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(stockTransferItemSchema).min(1),
});

export const receiveStockTransferSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

// =====================================================================
// PHASE 4 — CUSTOMERS & CREDIT
// =====================================================================

export const createCustomerSchema = z.object({
  type: z.enum(["INDIVIDUAL", "BUSINESS"]).default("INDIVIDUAL"),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(32).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  address: z.string().trim().max(240).optional(),
  creditLimit: money().default(0),
  notes: z.string().trim().max(500).optional(),
});

export const updateCustomerSchema = z.object({
  type: z.enum(["INDIVIDUAL", "BUSINESS"]).optional(),
  fullName: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  email: z.string().trim().email().toLowerCase().nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  creditLimit: money().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const createCustomerAddressSchema = z.object({
  label: z.string().trim().max(60).optional(),
  line1: z.string().trim().min(1).max(240),
  line2: z.string().trim().max(240).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  isDefault: z.boolean().default(false),
});

export const createCustomerNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

export const createDebtPaymentSchema = z.object({
  amount: positiveMoney(),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT_NOTE", "OTHER"]),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  paidAt: z.coerce.date().optional(),
});

export const remindDebtSchema = z.object({
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP"]).optional(),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Query `status` for GET /debts and GET /customers/:id/debts.
 *
 * PENDING / PARTIALLY_PAID / PAID / CANCELLED are stored settlement
 * statuses and filter the column.
 *
 * OVERDUE and DUE_TODAY are query aliases for the canonical calendar
 * predicates (dueDate + timezone + outstanding balance) — they are
 * NEVER stored. DUE_SOON is accepted here so the API can reject it
 * with a 422 naming the supported alternatives, instead of a generic
 * 400 enum error or a silently empty list.
 */
export const debtListStatusSchema = z.enum([
  "PENDING",
  "DUE_SOON",
  "DUE_TODAY",
  "OVERDUE",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
]);

export const listDebtsQuerySchema = z.object({
  status: debtListStatusSchema.optional(),
});

// =====================================================================
// PHASE 3 — SALES & POS
// =====================================================================

export const saleItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: quantity(),
  unitPrice: positiveMoney(),
  discountAmount: money().default(0),
  taxAmount: money().default(0),
});

export const createSaleSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().min(1),
  customerId: z.string().min(1).optional(),
  type: z.enum(["CASH", "CREDIT"]).default("CASH"),
  items: z.array(saleItemInputSchema).min(1),
  discountAmount: money().default(0),
  notes: z.string().trim().max(500).optional(),
  dueDate: z.coerce.date().optional(),
}).refine((data) => data.type !== "CREDIT" || Boolean(data.customerId), {
  message: "customerId is required for credit sales",
  path: ["customerId"],
}).refine((data) => data.type !== "CREDIT" || Boolean(data.dueDate), {
  message: "dueDate is required for credit sales",
  path: ["dueDate"],
});

export const salesReturnItemInputSchema = z.object({
  saleItemId: z.string().min(1),
  quantity: quantity(),
});

export const createSalesReturnSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  items: z.array(salesReturnItemInputSchema).min(1),
});

export const createSalePaymentSchema = z.object({
  amount: positiveMoney(),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT_NOTE", "OTHER"]),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  paidAt: z.coerce.date().optional(),
});

// =====================================================================
// PHASE 6 — PURCHASES
// =====================================================================

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(32).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  address: z.string().trim().max(240).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  email: z.string().trim().email().toLowerCase().nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  contactPerson: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const purchaseOrderItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: quantity(),
  unitCost: positiveMoney(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  expectedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(purchaseOrderItemInputSchema).min(1),
});

export const purchaseItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: quantity(),
  unitCost: positiveMoney(),
});

export const createPurchaseSchema = z.object({
  purchaseOrderId: z.string().min(1).optional(),
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
  items: z.array(purchaseItemInputSchema).min(1),
});

export const createSupplierPaymentSchema = z.object({
  purchaseId: z.string().min(1).optional(),
  amount: positiveMoney(),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT_NOTE", "OTHER"]),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  paidAt: z.coerce.date().optional(),
});

export const purchaseReturnItemInputSchema = z.object({
  purchaseItemId: z.string().min(1),
  quantity: quantity(),
});

export const createPurchaseReturnSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  items: z.array(purchaseReturnItemInputSchema).min(1),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
});

export const updateExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const createExpenseSchema = z.object({
  categoryId: z.string().min(1),
  branchId: z.string().min(1).optional(),
  amount: positiveMoney(),
  description: z.string().trim().min(1).max(500),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT_NOTE", "OTHER"]).optional(),
  reference: z.string().trim().max(120).optional(),
  expenseDate: z.coerce.date().optional(),
});

export const updateExpenseSchema = z.object({
  categoryId: z.string().min(1).optional(),
  branchId: z.string().min(1).nullable().optional(),
  amount: positiveMoney().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT_NOTE", "OTHER"]).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  expenseDate: z.coerce.date().optional(),
});

// =====================================================================
// PHASE 5 — AUTOMATION & MESSAGING
// =====================================================================

export const automationTriggerInputSchema = z.object({
  type: z.enum(["INVOICE_DUE_SOON", "INVOICE_DUE_TODAY", "INVOICE_OVERDUE", "LOW_STOCK", "MANUAL"]),
  offsetDays: z.number().int().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const automationActionInputSchema = z.object({
  type: z.enum(["SEND_WHATSAPP", "SEND_SMS", "SEND_EMAIL", "CREATE_NOTIFICATION", "WEBHOOK"]),
  order: z.number().int().nonnegative().default(0),
  templateId: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const createAutomationRuleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
  triggers: z.array(automationTriggerInputSchema).min(1),
  actions: z.array(automationActionInputSchema).min(1),
});

export const updateAutomationRuleSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  triggers: z.array(automationTriggerInputSchema).min(1).optional(),
  actions: z.array(automationActionInputSchema).min(1).optional(),
});

export const testAutomationRuleSchema = z.object({
  debtId: z.string().min(1).optional(),
});

export const createNotificationTemplateSchema = z.object({
  key: z.string().trim().min(1).max(80),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP"]),
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(4000),
  variables: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

export const updateNotificationTemplateSchema = z.object({
  subject: z.string().trim().max(160).nullable().optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

// Phase 2 — Inventory
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type StockAdjustmentItemInput = z.infer<typeof stockAdjustmentItemSchema>;
export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
export type StockTransferItemInput = z.infer<typeof stockTransferItemSchema>;
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type ReceiveStockTransferInput = z.infer<typeof receiveStockTransferSchema>;

// Phase 4 — Customers & Credit
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateCustomerAddressInput = z.infer<typeof createCustomerAddressSchema>;
export type CreateCustomerNoteInput = z.infer<typeof createCustomerNoteSchema>;
export type CreateDebtPaymentInput = z.infer<typeof createDebtPaymentSchema>;
export type RemindDebtInput = z.infer<typeof remindDebtSchema>;
export type ListDebtsQuery = z.infer<typeof listDebtsQuerySchema>;
export type DebtListStatus = z.infer<typeof debtListStatusSchema>;

// Phase 3 — Sales & POS
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type SalesReturnItemInput = z.infer<typeof salesReturnItemInputSchema>;
export type CreateSalesReturnInput = z.infer<typeof createSalesReturnSchema>;
export type CreateSalePaymentInput = z.infer<typeof createSalePaymentSchema>;

// Phase 6 — Purchases
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
export type PurchaseReturnItemInput = z.infer<typeof purchaseReturnItemInputSchema>;
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

// Phase 5 — Automation & Messaging
export type AutomationTriggerInput = z.infer<typeof automationTriggerInputSchema>;
export type AutomationActionInput = z.infer<typeof automationActionInputSchema>;
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;
export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>;
export type TestAutomationRuleInput = z.infer<typeof testAutomationRuleSchema>;
export type CreateNotificationTemplateInput = z.infer<typeof createNotificationTemplateSchema>;
export type UpdateNotificationTemplateInput = z.infer<typeof updateNotificationTemplateSchema>;

// =====================================================================
// PHASE 7 — REPORTS & ANALYTICS
// =====================================================================

const REPORT_MAX_RANGE_DAYS = 366;
const REPORT_MAX_LIMIT = 200;
const REPORT_DEFAULT_LIMIT = 50;
const REPORT_MAX_PAGE = 10000;
const REPORT_MAX_TOP_N = 100;

function validateReportDateRange(
  data: { startDate?: Date; endDate?: Date },
  ctx: z.RefinementCtx,
) {
  if (!data.startDate || !data.endDate) return;
  if (data.startDate.getTime() > data.endDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startDate must be on or before endDate",
      path: ["endDate"],
    });
    return;
  }
  const rangeMs = data.endDate.getTime() - data.startDate.getTime();
  const maxMs = REPORT_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (rangeMs > maxMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Date range cannot exceed ${REPORT_MAX_RANGE_DAYS} days`,
      path: ["endDate"],
    });
  }
}

const reportGroupBySchema = z.enum(["day", "week", "month"]);
const reportPageSchema = z.coerce.number().int().positive().max(REPORT_MAX_PAGE).default(1);
const reportLimitSchema = z.coerce.number().int().positive().max(REPORT_MAX_LIMIT).default(REPORT_DEFAULT_LIMIT);
const reportTopNSchema = z.coerce.number().int().positive().max(REPORT_MAX_TOP_N).default(10);
const reportDateField = z.coerce.date().optional();

export const reportDashboardQuerySchema = z.object({
  asOf: reportDateField,
});

export const reportSalesQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    groupBy: reportGroupBySchema.default("day"),
    branchId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    page: reportPageSchema,
    limit: reportLimitSchema,
  })
  .superRefine(validateReportDateRange);

export const reportSalesBreakdownQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    page: reportPageSchema,
    limit: reportLimitSchema,
  })
  .superRefine(validateReportDateRange);

export const reportTopProductsQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    sortBy: z.enum(["quantity", "revenue"]).default("revenue"),
    limit: reportTopNSchema,
  })
  .superRefine(validateReportDateRange);

export const reportInventoryValuationQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  page: reportPageSchema,
  limit: reportLimitSchema,
});

export const reportStockMovementSummaryQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    warehouseId: z.string().min(1).optional(),
  })
  .superRefine(validateReportDateRange);

export const reportLowStockQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  page: reportPageSchema,
  limit: reportLimitSchema,
});

export const reportExpiringBatchesQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  days: z.coerce.number().int().min(0).max(730).default(30),
  page: reportPageSchema,
  limit: reportLimitSchema,
});

export const reportSlowMovingQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  days: z.coerce.number().int().positive().max(365).default(30),
  page: reportPageSchema,
  limit: reportLimitSchema,
});

export const reportProfitQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    groupBy: reportGroupBySchema.default("day"),
  })
  .superRefine(validateReportDateRange);

export const reportProfitByProductQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    page: reportPageSchema,
    limit: reportLimitSchema,
  })
  .superRefine(validateReportDateRange);

export const reportAgingQuerySchema = z.object({
  asOf: reportDateField,
  page: reportPageSchema,
  limit: reportLimitSchema,
});

export const reportCollectionsQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
  })
  .superRefine(validateReportDateRange);

export const reportPurchasesQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    groupBy: reportGroupBySchema.default("day"),
    supplierId: z.string().min(1).optional(),
    page: reportPageSchema,
    limit: reportLimitSchema,
  })
  .superRefine(validateReportDateRange);

export const reportExpensesQuerySchema = z
  .object({
    startDate: reportDateField,
    endDate: reportDateField,
    categoryId: z.string().min(1).optional(),
    page: reportPageSchema,
    limit: reportLimitSchema,
  })
  .superRefine(validateReportDateRange);

export const reportPayablesQuerySchema = z.object({
  supplierId: z.string().min(1).optional(),
  page: reportPageSchema,
  limit: reportLimitSchema,
});

export type ReportDashboardQuery = z.infer<typeof reportDashboardQuerySchema>;
export type ReportSalesQuery = z.infer<typeof reportSalesQuerySchema>;
export type ReportSalesBreakdownQuery = z.infer<typeof reportSalesBreakdownQuerySchema>;
export type ReportTopProductsQuery = z.infer<typeof reportTopProductsQuerySchema>;
export type ReportInventoryValuationQuery = z.infer<typeof reportInventoryValuationQuerySchema>;
export type ReportStockMovementSummaryQuery = z.infer<typeof reportStockMovementSummaryQuerySchema>;
export type ReportLowStockQuery = z.infer<typeof reportLowStockQuerySchema>;
export type ReportExpiringBatchesQuery = z.infer<typeof reportExpiringBatchesQuerySchema>;
export type ReportSlowMovingQuery = z.infer<typeof reportSlowMovingQuerySchema>;
export type ReportProfitQuery = z.infer<typeof reportProfitQuerySchema>;
export type ReportProfitByProductQuery = z.infer<typeof reportProfitByProductQuerySchema>;
export type ReportAgingQuery = z.infer<typeof reportAgingQuerySchema>;
export type ReportCollectionsQuery = z.infer<typeof reportCollectionsQuerySchema>;
export type ReportPurchasesQuery = z.infer<typeof reportPurchasesQuerySchema>;
export type ReportExpensesQuery = z.infer<typeof reportExpensesQuerySchema>;
export type ReportPayablesQuery = z.infer<typeof reportPayablesQuerySchema>;
