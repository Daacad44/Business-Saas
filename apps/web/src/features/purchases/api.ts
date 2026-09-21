import type {
  ExpenseCategorySummary,
  ExpenseSummary,
  PurchaseItemSummary,
  PurchaseOrderItemSummary,
  PurchaseOrderSummary,
  PurchaseReturnItemSummary,
  PurchaseReturnSummary,
  PurchaseSummary,
  SupplierPaymentSummary,
  SupplierSummary,
} from "@daljir/types";
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  CreatePurchaseInput,
  CreatePurchaseOrderInput,
  CreatePurchaseReturnInput,
  CreateSupplierInput,
  CreateSupplierPaymentInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
  UpdateSupplierInput,
} from "@daljir/validation";
import { api, apiPaginated, apiWithMeta, buildQuery, type PaginationMeta } from "@/lib/api";

export const PAYMENT_METHODS = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CARD",
  "CREDIT_NOTE",
  "OTHER",
] as const;

export type SupplierRecord = SupplierSummary & {
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderRecord = PurchaseOrderSummary & {
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItemSummary[];
};

export type PurchaseRecord = PurchaseSummary & {
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseItemSummary[];
};

export type SupplierPaymentRecord = SupplierPaymentSummary & {
  notes: string | null;
};

export type PurchaseReturnRecord = PurchaseReturnSummary & {
  items?: PurchaseReturnItemSummary[];
};

export type OutstandingPayable = {
  supplierId: string;
  supplierName: string;
  outstanding: string;
};

export type PayablesAgingBucket = { count: number; total: string };

export type PayablesAging = {
  asOf: string;
  buckets: {
    current: PayablesAgingBucket;
    "1-30": PayablesAgingBucket;
    "31-60": PayablesAgingBucket;
    "61-90": PayablesAgingBucket;
    "90+": PayablesAgingBucket;
  };
  totalOutstanding: string;
};

export type CreateSupplierPaymentResult = {
  payment: SupplierPaymentRecord;
  supplierCurrentBalance: string;
};

export interface SupplierListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  [key: string]: string | number | boolean | undefined;
}

export function listSuppliers(params: SupplierListParams): Promise<{ data: SupplierRecord[]; meta: PaginationMeta }> {
  return apiPaginated(`/suppliers${buildQuery(params)}`);
}

export function getSupplier(id: string) {
  return api<SupplierRecord>(`/suppliers/${id}`);
}

export function createSupplier(input: CreateSupplierInput) {
  return api<SupplierRecord>("/suppliers", { method: "POST", body: JSON.stringify(input) });
}

export function updateSupplier(id: string, input: UpdateSupplierInput) {
  return api<SupplierRecord>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function disableSupplier(id: string) {
  return api<SupplierRecord>(`/suppliers/${id}`, { method: "DELETE" });
}

export function listSupplierPurchases(supplierId: string, page: number, pageSize: number) {
  return apiPaginated<PurchaseRecord[]>(`/suppliers/${supplierId}/purchases${buildQuery({ page, pageSize })}`);
}

export function listSupplierPayments(supplierId: string, page: number, pageSize: number) {
  return apiPaginated<SupplierPaymentRecord[]>(`/suppliers/${supplierId}/payments${buildQuery({ page, pageSize })}`);
}

export function createSupplierPayment(supplierId: string, input: CreateSupplierPaymentInput) {
  return api<CreateSupplierPaymentResult>(`/suppliers/${supplierId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface PurchaseOrderListParams {
  page: number;
  pageSize: number;
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listPurchaseOrders(params: PurchaseOrderListParams) {
  return apiPaginated<PurchaseOrderRecord[]>(`/purchase-orders${buildQuery(params)}`);
}

export function getPurchaseOrder(id: string) {
  return api<PurchaseOrderRecord>(`/purchase-orders/${id}`);
}

export function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  return api<PurchaseOrderRecord>("/purchase-orders", { method: "POST", body: JSON.stringify(input) });
}

export function approvePurchaseOrder(id: string) {
  return api<PurchaseOrderRecord>(`/purchase-orders/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
}

export function cancelPurchaseOrder(id: string) {
  return api<PurchaseOrderRecord>(`/purchase-orders/${id}/cancel`, { method: "POST", body: JSON.stringify({}) });
}

export interface PurchaseListParams {
  page: number;
  pageSize: number;
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listPurchases(params: PurchaseListParams) {
  return apiPaginated<PurchaseRecord[]>(`/purchases${buildQuery(params)}`);
}

export function getPurchase(id: string) {
  return api<PurchaseRecord>(`/purchases/${id}`);
}

export function createPurchase(input: CreatePurchaseInput) {
  return api<PurchaseRecord>("/purchases", { method: "POST", body: JSON.stringify(input) });
}

export interface PurchaseReturnListParams {
  page: number;
  pageSize: number;
  supplierId?: string;
  purchaseId?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listPurchaseReturns(params: PurchaseReturnListParams) {
  return apiPaginated<PurchaseReturnRecord[]>(`/purchases/returns${buildQuery(params)}`);
}

export function getPurchaseReturn(id: string) {
  return api<PurchaseReturnRecord>(`/purchases/returns/${id}`);
}

export function createPurchaseReturn(purchaseId: string, input: CreatePurchaseReturnInput) {
  return api<PurchaseReturnRecord>(`/purchases/${purchaseId}/returns`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface OutstandingPayablesParams {
  page: number;
  pageSize: number;
  [key: string]: string | number | boolean | undefined;
}

export function listOutstandingPayables(params: OutstandingPayablesParams) {
  return apiWithMeta<OutstandingPayable[], { totalOutstanding?: string }>(
    `/payables/outstanding${buildQuery(params)}`,
  );
}

export function getPayablesAging(params: { supplierId?: string; asOf?: string }) {
  return api<PayablesAging>(`/payables/aging${buildQuery(params)}`);
}

export interface PayablesPaymentListParams {
  page: number;
  pageSize: number;
  supplierId?: string;
  purchaseId?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listPayablesPayments(params: PayablesPaymentListParams) {
  return apiPaginated<SupplierPaymentRecord[]>(`/payables/payments${buildQuery(params)}`);
}

export function listExpenseCategories() {
  return api<ExpenseCategorySummary[]>("/expense-categories");
}

export function getExpenseCategory(id: string) {
  return api<ExpenseCategorySummary>(`/expense-categories/${id}`);
}

export function createExpenseCategory(input: CreateExpenseCategoryInput) {
  return api<ExpenseCategorySummary>("/expense-categories", { method: "POST", body: JSON.stringify(input) });
}

export function updateExpenseCategory(id: string, input: UpdateExpenseCategoryInput) {
  return api<ExpenseCategorySummary>(`/expense-categories/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteExpenseCategory(id: string) {
  return api<{ ok: true }>(`/expense-categories/${id}`, { method: "DELETE" });
}

export interface ExpenseListParams {
  page: number;
  pageSize: number;
  categoryId?: string;
  branchId?: string;
  method?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listExpenses(params: ExpenseListParams) {
  return apiPaginated<ExpenseSummary[]>(`/expenses${buildQuery(params)}`);
}

export function getExpense(id: string) {
  return api<ExpenseSummary>(`/expenses/${id}`);
}

export function createExpense(input: CreateExpenseInput) {
  return api<ExpenseSummary>("/expenses", { method: "POST", body: JSON.stringify(input) });
}

export function updateExpense(id: string, input: UpdateExpenseInput) {
  return api<ExpenseSummary>(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteExpense(id: string) {
  return api<{ ok: true }>(`/expenses/${id}`, { method: "DELETE" });
}

export type ExpenseTotalsByCategory = {
  categories: { categoryId: string; categoryName: string; count: number; totalAmount: string }[];
  totalAmount: string;
};

export function getExpenseTotalsByCategory(params: { branchId?: string; dateFrom?: string; dateTo?: string }) {
  return api<ExpenseTotalsByCategory>(`/expenses/summary/by-category${buildQuery(params)}`);
}
