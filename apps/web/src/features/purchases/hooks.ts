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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as purchasesApi from "./api";

export const purchaseKeys = {
  suppliers: (params?: unknown) => ["purchases", "suppliers", params] as const,
  supplier: (id: string) => ["purchases", "suppliers", "detail", id] as const,
  supplierPurchases: (id: string, params?: unknown) =>
    ["purchases", "suppliers", "detail", id, "purchases", params] as const,
  supplierPayments: (id: string, params?: unknown) =>
    ["purchases", "suppliers", "detail", id, "payments", params] as const,
  orders: (params?: unknown) => ["purchases", "orders", params] as const,
  order: (id: string) => ["purchases", "orders", "detail", id] as const,
  receipts: (params?: unknown) => ["purchases", "receipts", params] as const,
  receipt: (id: string) => ["purchases", "receipts", "detail", id] as const,
  returns: (params?: unknown) => ["purchases", "returns", params] as const,
  return: (id: string) => ["purchases", "returns", "detail", id] as const,
  payables: (params?: unknown) => ["purchases", "payables", params] as const,
  aging: (params?: unknown) => ["purchases", "payables", "aging", params] as const,
  payments: (params?: unknown) => ["purchases", "payments", params] as const,
  expenseCategories: ["expenses", "categories"] as const,
  expenseCategory: (id: string) => ["expenses", "categories", "detail", id] as const,
  expenses: (params?: unknown) => ["expenses", "list", params] as const,
  expense: (id: string) => ["expenses", "detail", id] as const,
  expenseSummary: (params?: unknown) => ["expenses", "summary", params] as const,
};

function invalidatePurchases(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["purchases"] });
}

export function useSuppliers(params: purchasesApi.SupplierListParams) {
  return useQuery({
    queryKey: purchaseKeys.suppliers(params),
    queryFn: () => purchasesApi.listSuppliers(params),
    placeholderData: (previous) => previous,
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: purchaseKeys.supplier(id),
    queryFn: () => purchasesApi.getSupplier(id),
    enabled: Boolean(id),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => purchasesApi.createSupplier(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchases", "suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupplierInput }) =>
      purchasesApi.updateSupplier(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", "suppliers"] });
      queryClient.invalidateQueries({ queryKey: purchaseKeys.supplier(variables.id) });
    },
  });
}

export function useDisableSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => purchasesApi.disableSupplier(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", "suppliers"] });
      queryClient.invalidateQueries({ queryKey: purchaseKeys.supplier(id) });
    },
  });
}

export function useSupplierPurchases(id: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: purchaseKeys.supplierPurchases(id, { page, pageSize }),
    queryFn: () => purchasesApi.listSupplierPurchases(id, page, pageSize),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
  });
}

export function useSupplierPayments(id: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: purchaseKeys.supplierPayments(id, { page, pageSize }),
    queryFn: () => purchasesApi.listSupplierPayments(id, page, pageSize),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
  });
}

export function useCreateSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierId, input }: { supplierId: string; input: CreateSupplierPaymentInput }) =>
      purchasesApi.createSupplierPayment(supplierId, input),
    onSuccess: () => invalidatePurchases(queryClient),
  });
}

export function usePurchaseOrders(params: purchasesApi.PurchaseOrderListParams) {
  return useQuery({
    queryKey: purchaseKeys.orders(params),
    queryFn: () => purchasesApi.listPurchaseOrders(params),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: purchaseKeys.order(id),
    queryFn: () => purchasesApi.getPurchaseOrder(id),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => purchasesApi.createPurchaseOrder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchases", "orders"] }),
  });
}

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => purchasesApi.approvePurchaseOrder(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", "orders"] });
      queryClient.invalidateQueries({ queryKey: purchaseKeys.order(id) });
    },
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => purchasesApi.cancelPurchaseOrder(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["purchases", "orders"] });
      queryClient.invalidateQueries({ queryKey: purchaseKeys.order(id) });
    },
  });
}

export function usePurchases(params: purchasesApi.PurchaseListParams) {
  return useQuery({
    queryKey: purchaseKeys.receipts(params),
    queryFn: () => purchasesApi.listPurchases(params),
    placeholderData: (previous) => previous,
  });
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: purchaseKeys.receipt(id),
    queryFn: () => purchasesApi.getPurchase(id),
    enabled: Boolean(id),
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseInput) => purchasesApi.createPurchase(input),
    onSuccess: () => {
      invalidatePurchases(queryClient);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function usePurchaseReturns(params: purchasesApi.PurchaseReturnListParams) {
  return useQuery({
    queryKey: purchaseKeys.returns(params),
    queryFn: () => purchasesApi.listPurchaseReturns(params),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseReturn(id: string) {
  return useQuery({
    queryKey: purchaseKeys.return(id),
    queryFn: () => purchasesApi.getPurchaseReturn(id),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, input }: { purchaseId: string; input: CreatePurchaseReturnInput }) =>
      purchasesApi.createPurchaseReturn(purchaseId, input),
    onSuccess: () => {
      invalidatePurchases(queryClient);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useOutstandingPayables(params: purchasesApi.OutstandingPayablesParams) {
  return useQuery({
    queryKey: purchaseKeys.payables(params),
    queryFn: () => purchasesApi.listOutstandingPayables(params),
    placeholderData: (previous) => previous,
  });
}

export function usePayablesAging(params: { supplierId?: string; asOf?: string }) {
  return useQuery({
    queryKey: purchaseKeys.aging(params),
    queryFn: () => purchasesApi.getPayablesAging(params),
  });
}

export function usePayablesPayments(params: purchasesApi.PayablesPaymentListParams) {
  return useQuery({
    queryKey: purchaseKeys.payments(params),
    queryFn: () => purchasesApi.listPayablesPayments(params),
    placeholderData: (previous) => previous,
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: purchaseKeys.expenseCategories,
    queryFn: purchasesApi.listExpenseCategories,
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseCategoryInput) => purchasesApi.createExpenseCategory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: purchaseKeys.expenseCategories }),
  });
}

export function useUpdateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExpenseCategoryInput }) =>
      purchasesApi.updateExpenseCategory(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: purchaseKeys.expenseCategories }),
  });
}

export function useDeleteExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => purchasesApi.deleteExpenseCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: purchaseKeys.expenseCategories }),
  });
}

export function useExpenses(params: purchasesApi.ExpenseListParams) {
  return useQuery({
    queryKey: purchaseKeys.expenses(params),
    queryFn: () => purchasesApi.listExpenses(params),
    placeholderData: (previous) => previous,
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: purchaseKeys.expense(id),
    queryFn: () => purchasesApi.getExpense(id),
    enabled: Boolean(id),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => purchasesApi.createExpense(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExpenseInput }) =>
      purchasesApi.updateExpense(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: purchaseKeys.expense(variables.id) });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => purchasesApi.deleteExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useExpenseTotalsByCategory(params: { branchId?: string; dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: purchaseKeys.expenseSummary(params),
    queryFn: () => purchasesApi.getExpenseTotalsByCategory(params),
  });
}
