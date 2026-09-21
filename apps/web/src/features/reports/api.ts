import type { PaymentMethod } from "@daljir/types";
import { ApiError, api, buildQuery } from "@/lib/api";
import { REPORT_DEFAULT_LIMIT } from "./lib/constants";
import type {
  CollectionsReport,
  DashboardReport,
  ExpensesReport,
  ExpiringBatchRow,
  InventoryValuationReport,
  LowStockRow,
  PayablesReport,
  ProfitByProductRow,
  ProfitReport,
  PurchasesReport,
  ReceivablesAgingReport,
  ReportGroupBy,
  ReportPageMeta,
  ReportWarehouseOption,
  SalesByBranchRow,
  SalesByCustomerRow,
  SalesByPaymentMethodRow,
  SalesByProductRow,
  SalesReport,
  SlowMovingRow,
  StockMovementSummaryReport,
  TopProductRow,
} from "./types";

interface RawApiResponse<T> {
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: Record<string, unknown>;
}

async function reportsRequest<T>(path: string): Promise<{ data: T; meta: Record<string, unknown> }> {
  const res = await fetch(`/api/v1${path}`, { credentials: "include" });
  let json: RawApiResponse<T>;
  try {
    json = (await res.json()) as RawApiResponse<T>;
  } catch {
    throw new ApiError("REQUEST_FAILED", "Request failed", res.status);
  }

  if (!res.ok || json.error) {
    throw new ApiError(
      json.error?.code ?? "REQUEST_FAILED",
      json.error?.message ?? "Request failed",
      res.status,
      json.error?.details,
    );
  }

  return { data: json.data, meta: json.meta ?? {} };
}

function pageMeta(meta: Record<string, unknown>, fallbackLimit = REPORT_DEFAULT_LIMIT): ReportPageMeta {
  const page = typeof meta.page === "number" ? meta.page : 1;
  const limit = typeof meta.limit === "number" ? meta.limit : fallbackLimit;
  const total = typeof meta.total === "number" ? meta.total : 0;
  const totalPages = typeof meta.totalPages === "number" ? meta.totalPages : Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  return { page, limit, total, totalPages };
}

export interface DateRangeParams {
  startDate: string;
  endDate: string;
  [key: string]: string | number | boolean | undefined;
}

export interface PageParams {
  page: number;
  limit: number;
  [key: string]: string | number | boolean | undefined;
}

export function getDashboard() {
  return api<DashboardReport>("/reports/dashboard");
}

export function getSalesReport(params: DateRangeParams & { groupBy: ReportGroupBy; branchId?: string; customerId?: string }) {
  return api<SalesReport>(`/reports/sales${buildQuery(params)}`);
}

export function getSalesByBranch(params: DateRangeParams & PageParams) {
  return reportsRequest<SalesByBranchRow[]>(`/reports/sales/by-branch${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getSalesByCustomer(params: DateRangeParams & PageParams) {
  return reportsRequest<SalesByCustomerRow[]>(`/reports/sales/by-customer${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getSalesByProduct(params: DateRangeParams & PageParams) {
  return reportsRequest<SalesByProductRow[]>(`/reports/sales/by-product${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getSalesByPaymentMethod(params: DateRangeParams) {
  return reportsRequest<SalesByPaymentMethodRow[]>(`/reports/sales/by-payment-method${buildQuery(params)}`).then(
    (res) => ({
      data: res.data,
      totalAmount: typeof res.meta.totalAmount === "string" ? res.meta.totalAmount : "0.00",
    }),
  );
}

export function getTopProducts(params: DateRangeParams & { sortBy: "quantity" | "revenue"; limit: number }) {
  return api<TopProductRow[]>(`/reports/sales/top-products${buildQuery(params)}`);
}

export function getInventoryValuation(params: PageParams & { warehouseId?: string }) {
  return reportsRequest<InventoryValuationReport>(`/reports/inventory/valuation${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getStockMovementSummary(params: DateRangeParams & { warehouseId?: string }) {
  return api<StockMovementSummaryReport>(`/reports/inventory/movements${buildQuery(params)}`);
}

export function getLowStockReport(params: PageParams & { warehouseId?: string }) {
  return reportsRequest<LowStockRow[]>(`/reports/inventory/low-stock${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getExpiringBatches(params: PageParams & { warehouseId?: string; days: number }) {
  return reportsRequest<ExpiringBatchRow[]>(`/reports/inventory/expiring-batches${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getSlowMovingStock(params: PageParams & { warehouseId?: string; days: number }) {
  return reportsRequest<SlowMovingRow[]>(`/reports/inventory/slow-moving${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getProfitReport(params: DateRangeParams & { groupBy: ReportGroupBy }) {
  return api<ProfitReport>(`/reports/profit${buildQuery(params)}`);
}

export function getProfitByProduct(params: DateRangeParams & PageParams) {
  return reportsRequest<ProfitByProductRow[]>(`/reports/profit/by-product${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getReceivablesAging(params: PageParams & { asOf?: string }) {
  return reportsRequest<ReceivablesAgingReport>(`/reports/receivables/aging${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getCollectionsSummary(params: DateRangeParams) {
  return api<CollectionsReport>(`/reports/receivables/collections${buildQuery(params)}`);
}

export function getPurchasesReport(params: DateRangeParams & PageParams & { groupBy: ReportGroupBy; supplierId?: string }) {
  return reportsRequest<PurchasesReport>(`/reports/purchases${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getExpensesReport(params: DateRangeParams & PageParams & { categoryId?: string }) {
  return reportsRequest<ExpensesReport>(`/reports/expenses${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function getPayablesReport(params: PageParams & { supplierId?: string }) {
  return reportsRequest<PayablesReport>(`/reports/payables${buildQuery(params)}`).then((res) => ({
    data: res.data,
    meta: pageMeta(res.meta, params.limit),
  }));
}

export function listReportWarehouses() {
  return api<ReportWarehouseOption[]>("/warehouses");
}

export type { PaymentMethod };
