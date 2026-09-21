import type { CreateDebtPaymentInput, RemindDebtInput } from "@daljir/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import * as debtsApi from "./api";

export const debtKeys = {
  list: (params?: unknown) => ["debts", "list", params] as const,
  overdue: ["debts", "overdue"] as const,
  dueToday: ["debts", "due-today"] as const,
  aging: (customerId?: string) => ["debts", "aging", customerId] as const,
  detail: (id: string) => ["debts", "detail", id] as const,
};

export function useDebts(params: debtsApi.DebtListParams) {
  return useQuery({
    queryKey: debtKeys.list(params),
    queryFn: () => debtsApi.listDebts(params),
    placeholderData: (previous) => previous,
  });
}

export function useOverdueDebts() {
  return useQuery({ queryKey: debtKeys.overdue, queryFn: debtsApi.listOverdueDebts });
}

export function useDueTodayDebts() {
  return useQuery({ queryKey: debtKeys.dueToday, queryFn: debtsApi.listDueTodayDebts });
}

export function useAgingReport(customerId?: string) {
  return useQuery({ queryKey: debtKeys.aging(customerId), queryFn: () => debtsApi.getAgingReport(customerId) });
}

export function useDebt(id: string) {
  return useQuery({ queryKey: debtKeys.detail(id), queryFn: () => debtsApi.getDebt(id) });
}

/**
 * `Business.timezone` — the same IANA zone the API uses for overdue /
 * due-today. Shared cache key with the settings page (`["business"]`).
 * Callers fall back to omitting the calendar badge until this resolves
 * rather than classifying in the browser's local zone.
 */
export function useBusinessTimezone() {
  const query = useQuery({
    queryKey: ["business"],
    queryFn: () => api<{ timezone: string }>("/businesses/current"),
    staleTime: 60_000,
  });
  const trimmed = query.data?.timezone?.trim();
  return { ...query, timeZone: trimmed || undefined };
}

function invalidateDebtSideEffects(queryClient: ReturnType<typeof useQueryClient>, debtId: string) {
  queryClient.invalidateQueries({ queryKey: ["debts"] });
  queryClient.invalidateQueries({ queryKey: debtKeys.detail(debtId) });
  queryClient.invalidateQueries({ queryKey: ["customers"] });
}

export function useRecordDebtPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateDebtPaymentInput }) => debtsApi.recordDebtPayment(id, input),
    onSuccess: (_data, variables) => invalidateDebtSideEffects(queryClient, variables.id),
  });
}

export function useRemindDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RemindDebtInput }) => debtsApi.remindDebt(id, input),
    onSuccess: (_data, variables) => invalidateDebtSideEffects(queryClient, variables.id),
  });
}
