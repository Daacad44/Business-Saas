import type { CustomerDebtSummary, InvoiceSummary, PaymentSummary, SaleItemSummary, SaleSummary } from "@daljir/types";
import { api, apiPaginated, buildQuery, type PaginationMeta } from "@/lib/api";

export interface InvoiceListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  customerId?: string;
  overdueOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: string | number | boolean | undefined;
}

export type InvoiceDetail = InvoiceSummary & {
  sale: (SaleSummary & { items: SaleItemSummary[] }) | null;
  payments: PaymentSummary[];
  debt: CustomerDebtSummary | null;
};

export type InvoiceReceipt = {
  business: { id: string; name: string } | null;
  invoice: InvoiceSummary;
  sale: SaleSummary & { items: SaleItemSummary[] };
  customer: { id: string; fullName: string; phone: string | null; email: string | null } | null;
  payments: PaymentSummary[];
};

export function listInvoices(params: InvoiceListParams): Promise<{ data: InvoiceSummary[]; meta: PaginationMeta }> {
  return apiPaginated(`/invoices${buildQuery(params)}`);
}

export function getInvoice(id: string) {
  return api<InvoiceDetail>(`/invoices/${id}`);
}

export function getInvoiceReceipt(id: string) {
  return api<InvoiceReceipt>(`/invoices/${id}/receipt`);
}
