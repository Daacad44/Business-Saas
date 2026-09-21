import type { PaymentMethod, StockMovementType } from "@daljir/types";

export type ReportGroupBy = "day" | "week" | "month";

export type AgingBucketKey = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface ReportPageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReportDateRangeQuery {
  startDate?: string;
  endDate?: string;
}

export interface ReportPageQuery extends ReportDateRangeQuery {
  page?: number;
  limit?: number;
}

export interface DashboardPeriodSummary {
  revenue: string;
  transactionCount: number;
  grossProfit: string;
  cashCollected: string;
}

export interface DashboardReport {
  asOf: string;
  today: DashboardPeriodSummary;
  thisWeek: DashboardPeriodSummary;
  thisMonth: DashboardPeriodSummary;
  outstandingReceivables: string;
  lowStockCount: number;
  overdueDebtCount: number;
}

export interface SalesReportTotals {
  revenue: string;
  discount: string;
  tax: string;
  transactionCount: number;
  averageBasketValue: string;
}

export interface SalesPeriodBucket {
  period: string;
  revenue: string;
  discount: string;
  tax: string;
  transactionCount: number;
}

export interface SalesReport {
  range: { startDate: string; endDate: string; groupBy: ReportGroupBy };
  totals: SalesReportTotals;
  breakdown: SalesPeriodBucket[];
}

export interface SalesByBranchRow {
  branchId: string;
  branchName: string | null;
  branchCode: string | null;
  revenue: string;
  transactionCount: number;
}

export interface SalesByCustomerRow {
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  revenue: string;
  transactionCount: number;
}

export interface SalesByProductRow {
  productId: string;
  productName: string | null;
  productSku: string | null;
  quantitySold: string;
  revenue: string;
  lineItemCount: number;
}

export interface SalesByPaymentMethodRow {
  method: PaymentMethod;
  amount: string;
  transactionCount: number;
  averageAmount: string;
}

export interface TopProductRow {
  productId: string;
  productName: string | null;
  productSku: string | null;
  quantitySold: string;
  revenue: string;
}

export interface InventoryValuationWarehouseRow {
  warehouseId: string;
  warehouseName: string;
  quantity: string;
  valuation: string;
}

export interface InventoryValuationReport {
  totalValuation: string;
  totalQuantity: string;
  byWarehouse: InventoryValuationWarehouseRow[];
}

export interface StockMovementTypeRow {
  type: StockMovementType;
  quantity: string;
  movementCount: number;
}

export interface StockMovementSummaryReport {
  range: { startDate: string; endDate: string };
  byType: StockMovementTypeRow[];
}

export type LowStockStatus = "OUT_OF_STOCK" | "LOW_STOCK";

export interface LowStockRow {
  stockLevelId: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  quantity: string;
  threshold: string;
  status: LowStockStatus;
}

export interface ExpiringBatchRow {
  batchId: string;
  batchNumber: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  quantity: string;
  expiryDate: string | null;
  isExpired: boolean;
}

export interface SlowMovingRow {
  stockLevelId: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  quantity: string;
  daysWithoutSale: number;
}

export interface ProfitTotals {
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: string;
}

export interface ProfitPeriodBucket {
  period: string;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: string;
}

export interface ProfitReport {
  range: { startDate: string; endDate: string; groupBy: ReportGroupBy };
  totals: ProfitTotals;
  breakdown: ProfitPeriodBucket[];
}

export interface ProfitByProductRow {
  productId: string;
  productName: string;
  quantitySold: string;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: string;
}

export interface AgingBucket {
  bucket: AgingBucketKey;
  outstanding: string;
  debtCount: number;
}

export interface AgingByCustomerRow {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  outstanding: string;
  debtCount: number;
  bucket: AgingBucketKey;
}

export interface ReceivablesAgingReport {
  asOf: string;
  totalOutstanding: string;
  buckets: AgingBucket[];
  byCustomer: AgingByCustomerRow[];
}

export interface CollectionsByMethodRow {
  method: PaymentMethod;
  amount: string;
  paymentCount: number;
}

export interface CollectionsReport {
  range: { startDate: string; endDate: string };
  totalCollected: string;
  paymentCount: number;
  byMethod: CollectionsByMethodRow[];
}

export interface PurchasesPeriodBucket {
  period: string;
  totalSpend: string;
  purchaseCount: number;
}

export interface PurchasesBySupplierRow {
  supplierId: string;
  supplierName: string | null;
  totalSpend: string;
  purchaseCount: number;
}

export interface PurchasesReport {
  range: { startDate: string; endDate: string; groupBy: ReportGroupBy };
  totals: { totalSpend: string; purchaseCount: number };
  breakdown: PurchasesPeriodBucket[];
  bySupplier: PurchasesBySupplierRow[];
}

export interface ExpensesByCategoryRow {
  categoryId: string;
  categoryName: string | null;
  totalSpend: string;
  expenseCount: number;
}

export interface ExpensesReport {
  range: { startDate: string; endDate: string };
  totals: { totalSpend: string; expenseCount: number };
  byCategory: ExpensesByCategoryRow[];
}

export interface PayableSupplierRow {
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  outstandingBalance: string;
}

export interface PayablesReport {
  totalPayable: string;
  suppliers: PayableSupplierRow[];
}

export interface ReportWarehouseOption {
  id: string;
  name: string;
}
