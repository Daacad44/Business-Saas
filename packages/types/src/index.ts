export type ApiSuccess<T> = {
  data: T;
  error: null;
  meta?: Record<string, unknown>;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiFailure = {
  data: null;
  error: ApiErrorBody;
  meta?: Record<string, unknown>;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type BusinessType =
  | "RETAIL"
  | "WHOLESALE"
  | "SUPERMARKET"
  | "PHARMACY"
  | "ELECTRONICS"
  | "CLOTHING"
  | "HARDWARE"
  | "MOBILE"
  | "AUTO_PARTS"
  | "GENERAL_TRADING"
  | "OTHER";

export type PermissionKey =
  | "sales.create"
  | "sales.read"
  | "sales.update"
  | "sales.delete"
  | "inventory.create"
  | "inventory.read"
  | "inventory.adjust"
  | "inventory.transfer"
  | "customers.create"
  | "customers.read"
  | "customers.update"
  | "debts.read"
  | "debts.collect"
  | "debts.remind"
  | "purchases.create"
  | "purchases.read"
  | "reports.read"
  | "expenses.create"
  | "expenses.read"
  | "users.invite"
  | "users.manage"
  | "settings.manage"
  | "automation.manage";

export type RoleSlug =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "cashier"
  | "sales_staff"
  | "inventory_manager"
  | "warehouse_staff"
  | "viewer";

export type PlatformRole = "USER" | "SUPER_ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: "ACTIVE" | "DISABLED" | "PENDING";
  platformRole: PlatformRole;
};

export type MembershipSummary = {
  id: string;
  businessId: string;
  businessName: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  permissions: PermissionKey[];
};

export type SessionPayload = {
  user: AuthUser;
  memberships: MembershipSummary[];
  currentMembership: MembershipSummary | null;
};

// =====================================================================
// PHASE 2 — INVENTORY
// =====================================================================

export type CategoryStatus = "ACTIVE" | "ARCHIVED";
export type ProductStatus = "ACTIVE" | "ARCHIVED";
export type ProductVariantStatus = "ACTIVE" | "ARCHIVED";
export type StockMovementType =
  | "PURCHASE_IN"
  | "SALE_OUT"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "RETURN_IN"
  | "RETURN_OUT"
  | "OPENING_BALANCE";
export type StockAdjustmentReason = "DAMAGE" | "THEFT" | "EXPIRY" | "RECOUNT" | "OTHER";
export type StockAdjustmentStatus = "PENDING" | "APPLIED" | "CANCELLED";
export type StockTransferStatus = "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

export type UnitSummary = {
  id: string;
  businessId: string;
  name: string;
  symbol: string;
};

export type CategorySummary = {
  id: string;
  businessId: string;
  name: string;
  parentId: string | null;
  description: string | null;
  status: CategoryStatus;
};

export type ProductSummary = {
  id: string;
  businessId: string;
  categoryId: string | null;
  unitId: string | null;
  name: string;
  sku: string;
  barcode: string | null;
  costPrice: string;
  sellingPrice: string;
  taxRate: string;
  trackStock: boolean;
  hasVariants: boolean;
  lowStockThreshold: string | null;
  status: ProductStatus;
};

export type ProductVariantSummary = {
  id: string;
  businessId: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  costPrice: string;
  sellingPrice: string;
  attributes: Record<string, unknown>;
  status: ProductVariantStatus;
};

export type BatchSummary = {
  id: string;
  businessId: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  batchNumber: string;
  expiryDate: string | null;
  quantity: string;
  costPrice: string | null;
};

export type StockLevelSummary = {
  id: string;
  businessId: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  reservedQuantity: string;
  reorderLevel: string | null;
};

export type StockMovementSummary = {
  id: string;
  businessId: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  batchId: string | null;
  type: StockMovementType;
  quantity: string;
  unitCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  performedById: string | null;
  createdAt: string;
};

export type StockAdjustmentSummary = {
  id: string;
  businessId: string;
  warehouseId: string;
  reason: StockAdjustmentReason;
  reference: string | null;
  notes: string | null;
  status: StockAdjustmentStatus;
  createdById: string | null;
  createdAt: string;
};

export type StockAdjustmentItemSummary = {
  id: string;
  adjustmentId: string;
  productId: string;
  variantId: string | null;
  quantityDelta: string;
  unitCost: string | null;
  movementId: string | null;
};

export type StockTransferSummary = {
  id: string;
  businessId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: StockTransferStatus;
  reference: string | null;
  notes: string | null;
  requestedById: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type StockTransferItemSummary = {
  id: string;
  transferId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  outboundMovementId: string | null;
  inboundMovementId: string | null;
};

// =====================================================================
// PHASE 4 — CUSTOMERS & CREDIT
// =====================================================================

export type CustomerType = "INDIVIDUAL" | "BUSINESS";
export type CustomerStatus = "ACTIVE" | "ARCHIVED";
export type DebtStatus =
  | "PENDING"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "OVERDUE"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

export type CustomerSummary = {
  id: string;
  businessId: string;
  type: CustomerType;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: string;
  currentBalance: string;
  status: CustomerStatus;
};

export type CustomerAddressSummary = {
  id: string;
  customerId: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  isDefault: boolean;
};

export type CustomerNoteSummary = {
  id: string;
  customerId: string;
  authorId: string | null;
  note: string;
  createdAt: string;
};

export type CustomerDebtSummary = {
  id: string;
  businessId: string;
  customerId: string;
  invoiceId: string;
  principalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  dueDate: string;
  status: DebtStatus;
  remindersSent: number;
  lastReminderAt: string | null;
};

export type DebtPaymentSummary = {
  id: string;
  businessId: string;
  debtId: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  collectedById: string | null;
  paidAt: string;
  notes: string | null;
};

// =====================================================================
// PHASE 3 — SALES & POS
// =====================================================================

export type SaleType = "CASH" | "CREDIT";
export type SaleStatus = "DRAFT" | "COMPLETED" | "VOIDED";
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
export type PaymentMethod = "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CARD" | "CREDIT_NOTE" | "OTHER";
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
export type SalesReturnStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export type SaleSummary = {
  id: string;
  businessId: string;
  branchId: string;
  warehouseId: string;
  customerId: string | null;
  cashierId: string | null;
  saleNumber: string;
  type: SaleType;
  status: SaleStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  soldAt: string;
};

export type SaleItemSummary = {
  id: string;
  saleId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  costPriceSnapshot: string | null;
  movementId: string | null;
};

export type InvoiceSummary = {
  id: string;
  businessId: string;
  saleId: string;
  customerId: string | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  amountDue: string;
  dueDate: string | null;
  issuedAt: string;
  paidAt: string | null;
};

export type PaymentSummary = {
  id: string;
  businessId: string;
  invoiceId: string | null;
  customerId: string | null;
  method: PaymentMethod;
  amount: string;
  status: PaymentStatus;
  reference: string | null;
  receivedById: string | null;
  paidAt: string;
};

export type PaymentAllocationSummary = {
  id: string;
  paymentId: string;
  invoiceId: string | null;
  debtId: string | null;
  amount: string;
};

export type SalesReturnSummary = {
  id: string;
  businessId: string;
  saleId: string;
  customerId: string | null;
  returnNumber: string;
  reason: string | null;
  status: SalesReturnStatus;
  totalAmount: string;
  processedById: string | null;
  returnedAt: string;
};

export type SalesReturnItemSummary = {
  id: string;
  returnId: string;
  saleItemId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
  movementId: string | null;
};

// =====================================================================
// PHASE 6 — PURCHASES
// =====================================================================

export type SupplierStatus = "ACTIVE" | "ARCHIVED";
export type PurchaseOrderStatus = "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
export type PurchaseStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type PurchaseReturnStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export type SupplierSummary = {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  status: SupplierStatus;
  currentBalance: string;
};

export type PurchaseOrderSummary = {
  id: string;
  businessId: string;
  supplierId: string;
  warehouseId: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  expectedAt: string | null;
  orderedById: string | null;
};

export type PurchaseOrderItemSummary = {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  unitCost: string;
  totalCost: string;
};

export type PurchaseSummary = {
  id: string;
  businessId: string;
  purchaseOrderId: string | null;
  supplierId: string;
  warehouseId: string;
  purchaseNumber: string;
  status: PurchaseStatus;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  amountDue: string;
  receivedById: string | null;
  receivedAt: string;
};

export type PurchaseItemSummary = {
  id: string;
  purchaseId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  unitCost: string;
  totalCost: string;
  movementId: string | null;
};

export type SupplierPaymentSummary = {
  id: string;
  businessId: string;
  supplierId: string;
  purchaseId: string | null;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  paidById: string | null;
  paidAt: string;
};

export type PurchaseReturnSummary = {
  id: string;
  businessId: string;
  purchaseId: string;
  supplierId: string;
  returnNumber: string;
  status: PurchaseReturnStatus;
  totalAmount: string;
  reason: string | null;
  processedById: string | null;
  returnedAt: string;
};

export type PurchaseReturnItemSummary = {
  id: string;
  returnId: string;
  purchaseItemId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  unitCost: string;
  totalAmount: string;
  movementId: string | null;
};

export type ExpenseCategorySummary = {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
};

export type ExpenseSummary = {
  id: string;
  businessId: string;
  categoryId: string;
  branchId: string | null;
  amount: string;
  description: string;
  method: PaymentMethod | null;
  reference: string | null;
  paidById: string | null;
  expenseDate: string;
};

// =====================================================================
// PHASE 5 — AUTOMATION & MESSAGING
// =====================================================================

export type AutomationTriggerType =
  | "INVOICE_DUE_SOON"
  | "INVOICE_DUE_TODAY"
  | "INVOICE_OVERDUE"
  | "LOW_STOCK"
  | "MANUAL";
export type AutomationActionType =
  | "SEND_WHATSAPP"
  | "SEND_SMS"
  | "SEND_EMAIL"
  | "CREATE_NOTIFICATION"
  | "WEBHOOK";
export type AutomationExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
export type ScheduledJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type NotificationChannel = "WHATSAPP" | "SMS" | "EMAIL" | "IN_APP";
export type NotificationStatus = "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "READ";
export type MessageDeliveryStatus = "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "UNDELIVERED";

export type AutomationRuleSummary = {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type AutomationTriggerSummary = {
  id: string;
  ruleId: string;
  type: AutomationTriggerType;
  offsetDays: number | null;
  config: Record<string, unknown>;
};

export type AutomationActionSummary = {
  id: string;
  ruleId: string;
  type: AutomationActionType;
  order: number;
  templateId: string | null;
  config: Record<string, unknown>;
};

export type AutomationExecutionSummary = {
  id: string;
  businessId: string;
  ruleId: string;
  triggerId: string | null;
  debtId: string | null;
  stockLevelId: string | null;
  status: AutomationExecutionStatus;
  idempotencyKey: string;
  attempt: number;
  error: string | null;
  executedAt: string | null;
};

export type ScheduledJobSummary = {
  id: string;
  businessId: string;
  type: string;
  payload: Record<string, unknown>;
  status: ScheduledJobStatus;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  idempotencyKey: string;
  completedAt: string | null;
};

export type NotificationTemplateSummary = {
  id: string;
  businessId: string;
  key: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  variables: Record<string, unknown>;
  isActive: boolean;
  version: number;
};

export type NotificationSummary = {
  id: string;
  businessId: string;
  customerId: string | null;
  userId: string | null;
  templateId: string | null;
  executionId: string | null;
  channel: NotificationChannel;
  title: string | null;
  body: string;
  status: NotificationStatus;
  readAt: string | null;
  sentAt: string | null;
};

export type NotificationLogSummary = {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  provider: string | null;
  status: MessageDeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  deliveredAt: string | null;
};

export type WhatsAppMessageSummary = {
  id: string;
  businessId: string;
  notificationId: string | null;
  toPhone: string;
  templateName: string | null;
  content: string;
  status: MessageDeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
};

export type SMSMessageSummary = {
  id: string;
  businessId: string;
  notificationId: string | null;
  toPhone: string;
  content: string;
  status: MessageDeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
};

export type EmailMessageSummary = {
  id: string;
  businessId: string;
  notificationId: string | null;
  toEmail: string;
  subject: string | null;
  content: string;
  status: MessageDeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
};
