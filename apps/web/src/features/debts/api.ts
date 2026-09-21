import type { CustomerDebtSummary } from "@daljir/types";
import type { CreateDebtPaymentInput, RemindDebtInput } from "@daljir/validation";
import { api, apiPaginated, buildQuery, type PaginationMeta } from "@/lib/api";
import type { DebtWithRelations } from "@/features/customers/api";

export interface DebtListParams {
  page: number;
  pageSize: number;
  customerId?: string;
  status?: string;
  overdueOnly?: boolean;
  dueDateFrom?: string;
  dueDateTo?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listDebts(params: DebtListParams): Promise<{ data: CustomerDebtSummary[]; meta: PaginationMeta }> {
  return apiPaginated(`/debts${buildQuery(params)}`);
}

export function listOverdueDebts() {
  return api<CustomerDebtSummary[]>("/debts/overdue");
}

export function listDueTodayDebts() {
  return api<CustomerDebtSummary[]>("/debts/due-today");
}

export interface AgingBucket {
  count: number;
  total: string;
}

export interface AgingReport {
  asOf: string;
  buckets: {
    current: AgingBucket;
    "1-30": AgingBucket;
    "31-60": AgingBucket;
    "61-90": AgingBucket;
    "90+": AgingBucket;
  };
  totalOutstanding: string;
}

export function getAgingReport(customerId?: string) {
  return api<AgingReport>(`/debts/aging${buildQuery({ customerId })}`);
}

export function getDebt(id: string) {
  return api<DebtWithRelations>(`/debts/${id}`);
}

export interface RecordPaymentResult {
  payment: { id: string; amount: string };
  debt: CustomerDebtSummary;
  invoice: unknown;
  customerCurrentBalance: string;
}

export function recordDebtPayment(id: string, input: CreateDebtPaymentInput) {
  return api<RecordPaymentResult>(`/debts/${id}/payments`, { method: "POST", body: JSON.stringify(input) });
}

export interface RemindDebtResult {
  debtId: string;
  notificationId: string;
  duplicated: boolean;
}

export function remindDebt(id: string, input: RemindDebtInput) {
  return api<RemindDebtResult>(`/debts/${id}/remind`, { method: "POST", body: JSON.stringify(input) });
}
