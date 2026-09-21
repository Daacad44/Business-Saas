import { useQuery } from "@tanstack/react-query";
import * as reportsApi from "./api";
import { isDateRangeValid, type DateRangeState } from "./lib/dates";
import type { ReportGroupBy } from "./types";

export const reportKeys = {
  all: ["reports"] as const,
  dashboard: ["reports", "dashboard"] as const,
  sales: (params: unknown) => ["reports", "sales", params] as const,
  salesByBranch: (params: unknown) => ["reports", "sales", "by-branch", params] as const,
  salesByCustomer: (params: unknown) => ["reports", "sales", "by-customer", params] as const,
  salesByProduct: (params: unknown) => ["reports", "sales", "by-product", params] as const,
  salesByPaymentMethod: (params: unknown) => ["reports", "sales", "by-payment-method", params] as const,
  topProducts: (params: unknown) => ["reports", "sales", "top-products", params] as const,
  inventoryValuation: (params: unknown) => ["reports", "inventory", "valuation", params] as const,
  inventoryMovements: (params: unknown) => ["reports", "inventory", "movements", params] as const,
  lowStock: (params: unknown) => ["reports", "inventory", "low-stock", params] as const,
  expiringBatches: (params: unknown) => ["reports", "inventory", "expiring-batches", params] as const,
  slowMoving: (params: unknown) => ["reports", "inventory", "slow-moving", params] as const,
  profit: (params: unknown) => ["reports", "profit", params] as const,
  profitByProduct: (params: unknown) => ["reports", "profit", "by-product", params] as const,
  receivablesAging: (params: unknown) => ["reports", "receivables", "aging", params] as const,
  collections: (params: unknown) => ["reports", "receivables", "collections", params] as const,
  purchases: (params: unknown) => ["reports", "purchases", params] as const,
  expenses: (params: unknown) => ["reports", "expenses", params] as const,
  payables: (params: unknown) => ["reports", "payables", params] as const,
  warehouses: ["reports", "warehouses"] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: reportKeys.dashboard,
    queryFn: reportsApi.getDashboard,
  });
}

export function useSalesReport(params: reportsApi.DateRangeParams & { groupBy: ReportGroupBy }, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.sales(params),
    queryFn: () => reportsApi.getSalesReport(params),
    enabled,
  });
}

export function useSalesByBranch(params: reportsApi.DateRangeParams & reportsApi.PageParams, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.salesByBranch(params),
    queryFn: () => reportsApi.getSalesByBranch(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useSalesByCustomer(params: reportsApi.DateRangeParams & reportsApi.PageParams, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.salesByCustomer(params),
    queryFn: () => reportsApi.getSalesByCustomer(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useSalesByProduct(params: reportsApi.DateRangeParams & reportsApi.PageParams, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.salesByProduct(params),
    queryFn: () => reportsApi.getSalesByProduct(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useSalesByPaymentMethod(params: reportsApi.DateRangeParams, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.salesByPaymentMethod(params),
    queryFn: () => reportsApi.getSalesByPaymentMethod(params),
    enabled,
  });
}

export function useTopProducts(
  params: reportsApi.DateRangeParams & { sortBy: "quantity" | "revenue"; limit: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: reportKeys.topProducts(params),
    queryFn: () => reportsApi.getTopProducts(params),
    enabled,
  });
}

export function useInventoryValuation(params: reportsApi.PageParams & { warehouseId?: string }) {
  return useQuery({
    queryKey: reportKeys.inventoryValuation(params),
    queryFn: () => reportsApi.getInventoryValuation(params),
    placeholderData: (previous) => previous,
  });
}

export function useStockMovementSummary(params: reportsApi.DateRangeParams & { warehouseId?: string }, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.inventoryMovements(params),
    queryFn: () => reportsApi.getStockMovementSummary(params),
    enabled,
  });
}

export function useLowStockReport(params: reportsApi.PageParams & { warehouseId?: string }) {
  return useQuery({
    queryKey: reportKeys.lowStock(params),
    queryFn: () => reportsApi.getLowStockReport(params),
    placeholderData: (previous) => previous,
  });
}

export function useExpiringBatches(params: reportsApi.PageParams & { warehouseId?: string; days: number }) {
  return useQuery({
    queryKey: reportKeys.expiringBatches(params),
    queryFn: () => reportsApi.getExpiringBatches(params),
    placeholderData: (previous) => previous,
  });
}

export function useSlowMovingStock(params: reportsApi.PageParams & { warehouseId?: string; days: number }) {
  return useQuery({
    queryKey: reportKeys.slowMoving(params),
    queryFn: () => reportsApi.getSlowMovingStock(params),
    placeholderData: (previous) => previous,
  });
}

export function useProfitReport(params: reportsApi.DateRangeParams & { groupBy: ReportGroupBy }, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.profit(params),
    queryFn: () => reportsApi.getProfitReport(params),
    enabled,
  });
}

export function useProfitByProduct(params: reportsApi.DateRangeParams & reportsApi.PageParams, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.profitByProduct(params),
    queryFn: () => reportsApi.getProfitByProduct(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useReceivablesAging(params: reportsApi.PageParams & { asOf?: string }) {
  return useQuery({
    queryKey: reportKeys.receivablesAging(params),
    queryFn: () => reportsApi.getReceivablesAging(params),
    placeholderData: (previous) => previous,
  });
}

export function useCollectionsSummary(params: reportsApi.DateRangeParams, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.collections(params),
    queryFn: () => reportsApi.getCollectionsSummary(params),
    enabled,
  });
}

export function usePurchasesReport(
  params: reportsApi.DateRangeParams & reportsApi.PageParams & { groupBy: ReportGroupBy; supplierId?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: reportKeys.purchases(params),
    queryFn: () => reportsApi.getPurchasesReport(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useExpensesReport(
  params: reportsApi.DateRangeParams & reportsApi.PageParams & { categoryId?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: reportKeys.expenses(params),
    queryFn: () => reportsApi.getExpensesReport(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function usePayablesReport(params: reportsApi.PageParams & { supplierId?: string }) {
  return useQuery({
    queryKey: reportKeys.payables(params),
    queryFn: () => reportsApi.getPayablesReport(params),
    placeholderData: (previous) => previous,
  });
}

export function useReportWarehouses() {
  return useQuery({
    queryKey: reportKeys.warehouses,
    queryFn: reportsApi.listReportWarehouses,
  });
}

export function rangeQueryEnabled(range: DateRangeState): boolean {
  return isDateRangeValid(range);
}
