import type {
  CustomerAddressSummary,
  CustomerDebtSummary,
  CustomerNoteSummary,
  CustomerSummary,
  DebtPaymentSummary,
  InvoiceSummary,
  SaleSummary,
} from "@daljir/types";
import type {
  CreateCustomerAddressInput,
  CreateCustomerInput,
  CreateCustomerNoteInput,
  UpdateCustomerInput,
} from "@daljir/validation";
import { api, apiPaginated, buildQuery, type PaginationMeta } from "@/lib/api";

export interface CustomerListParams {
  page: number;
  pageSize: number;
  search?: string;
  type?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  [key: string]: string | number | boolean | undefined;
}

export function listCustomers(params: CustomerListParams): Promise<{ data: CustomerSummary[]; meta: PaginationMeta }> {
  return apiPaginated(`/customers${buildQuery(params)}`);
}

export function getCustomer(id: string) {
  return api<CustomerSummary>(`/customers/${id}`);
}

export function createCustomer(input: CreateCustomerInput) {
  return api<CustomerSummary>("/customers", { method: "POST", body: JSON.stringify(input) });
}

export function updateCustomer(id: string, input: UpdateCustomerInput) {
  return api<CustomerSummary>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function disableCustomer(id: string) {
  return api<CustomerSummary>(`/customers/${id}`, { method: "DELETE" });
}

export function updateCreditLimit(id: string, creditLimit: number) {
  return api<CustomerSummary>(`/customers/${id}/credit-limit`, {
    method: "PATCH",
    body: JSON.stringify({ creditLimit }),
  });
}

export interface AvailableCredit {
  customerId: string;
  creditLimit: string;
  currentBalance: string;
  availableCredit: string;
}

export function getAvailableCredit(id: string) {
  return api<AvailableCredit>(`/customers/${id}/credit`);
}

export function listAddresses(customerId: string) {
  return api<CustomerAddressSummary[]>(`/customers/${customerId}/addresses`);
}

export function createAddress(customerId: string, input: CreateCustomerAddressInput) {
  return api<CustomerAddressSummary>(`/customers/${customerId}/addresses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAddress(customerId: string, addressId: string, input: Partial<CreateCustomerAddressInput>) {
  return api<CustomerAddressSummary>(`/customers/${customerId}/addresses/${addressId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAddress(customerId: string, addressId: string) {
  return api<{ ok: true }>(`/customers/${customerId}/addresses/${addressId}`, { method: "DELETE" });
}

export function listNotes(customerId: string) {
  return api<CustomerNoteSummary[]>(`/customers/${customerId}/notes`);
}

export function createNote(customerId: string, input: CreateCustomerNoteInput) {
  return api<CustomerNoteSummary>(`/customers/${customerId}/notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listCustomerDebts(customerId: string) {
  return api<CustomerDebtSummary[]>(`/customers/${customerId}/debts`);
}

export function listCustomerPayments(customerId: string) {
  return api<DebtPaymentSummary[]>(`/customers/${customerId}/payments`);
}

export function listCustomerSales(customerId: string, page: number, pageSize: number) {
  return apiPaginated<SaleSummary[]>(`/customers/${customerId}/sales${buildQuery({ page, pageSize })}`);
}

export type DebtWithRelations = CustomerDebtSummary & {
  payments: DebtPaymentSummary[];
  invoice: InvoiceSummary;
  customer: { id: string; fullName: string; phone: string | null; email: string | null };
};
