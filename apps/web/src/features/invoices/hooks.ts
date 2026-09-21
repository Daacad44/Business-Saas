import { useQuery } from "@tanstack/react-query";
import * as invoicesApi from "./api";

export const invoiceKeys = {
  list: (params?: unknown) => ["invoices", "list", params] as const,
  detail: (id: string) => ["invoices", "detail", id] as const,
  receipt: (id: string) => ["invoices", "receipt", id] as const,
};

export function useInvoices(params: invoicesApi.InvoiceListParams) {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => invoicesApi.listInvoices(params),
    placeholderData: (previous) => previous,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => invoicesApi.getInvoice(id),
    enabled: Boolean(id),
  });
}

export function useInvoiceReceipt(id: string, enabled = true) {
  return useQuery({
    queryKey: invoiceKeys.receipt(id),
    queryFn: () => invoicesApi.getInvoiceReceipt(id),
    enabled: Boolean(id) && enabled,
  });
}
