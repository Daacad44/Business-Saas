import type {
  CustomerDebtSummary,
  InvoiceSummary,
  PaymentSummary,
  SaleItemSummary,
  SaleSummary,
  SalesReturnItemSummary,
  SalesReturnSummary,
} from "@daljir/types";
import type { CreateSaleInput, CreateSalePaymentInput, CreateSalesReturnInput } from "@daljir/validation";
import { api, apiPaginated, buildQuery, type PaginationMeta } from "@/lib/api";

export interface SaleListParams {
  page: number;
  pageSize: number;
  search?: string;
  branchId?: string;
  warehouseId?: string;
  customerId?: string;
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  [key: string]: string | number | boolean | undefined;
}

export type SaleDetail = SaleSummary & {
  notes: string | null;
  items: SaleItemSummary[];
  invoice: InvoiceSummary | null;
  payments: PaymentSummary[];
  debt: CustomerDebtSummary | null;
};

export type CreateSaleResult = SaleSummary & {
  notes: string | null;
  items: SaleItemSummary[];
  invoice: InvoiceSummary;
  payment: PaymentSummary | null;
  debt: CustomerDebtSummary | null;
  customerBalance: string | null;
};

export type SalesReturnResult = SalesReturnSummary & {
  items: SalesReturnItemSummary[];
  invoice: InvoiceSummary | null;
  debt: CustomerDebtSummary | null;
  customerBalance: string | null;
};

export type SalePaymentResult = {
  payment: PaymentSummary;
  invoice: InvoiceSummary;
  debt: CustomerDebtSummary | null;
  customerBalance: string | null;
};

export function listSales(params: SaleListParams): Promise<{ data: SaleSummary[]; meta: PaginationMeta }> {
  return apiPaginated(`/sales${buildQuery(params)}`);
}

export function getSale(id: string) {
  return api<SaleDetail>(`/sales/${id}`);
}

export function createSale(input: CreateSaleInput) {
  return api<CreateSaleResult>("/sales", { method: "POST", body: JSON.stringify(input) });
}

export function createSalesReturn(saleId: string, input: CreateSalesReturnInput) {
  return api<SalesReturnResult>(`/sales/${saleId}/return`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createSalePayment(saleId: string, input: CreateSalePaymentInput) {
  return api<SalePaymentResult>(`/sales/${saleId}/payment`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
