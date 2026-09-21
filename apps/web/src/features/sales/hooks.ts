import type { CreateSaleInput, CreateSalePaymentInput, CreateSalesReturnInput } from "@daljir/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as salesApi from "./api";

export const saleKeys = {
  list: (params?: unknown) => ["sales", "list", params] as const,
  detail: (id: string) => ["sales", "detail", id] as const,
};

export function invalidateAfterSale(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["sales"] });
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-movements"] });
  queryClient.invalidateQueries({ queryKey: ["customers"] });
  queryClient.invalidateQueries({ queryKey: ["debts"] });
}

export function useSales(params: salesApi.SaleListParams) {
  return useQuery({
    queryKey: saleKeys.list(params),
    queryFn: () => salesApi.listSales(params),
    placeholderData: (previous) => previous,
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: saleKeys.detail(id),
    queryFn: () => salesApi.getSale(id),
    enabled: Boolean(id),
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSaleInput) => salesApi.createSale(input),
    onSuccess: (data) => {
      invalidateAfterSale(queryClient);
      queryClient.setQueryData(saleKeys.detail(data.id), {
        ...data,
        payments: data.payment ? [data.payment] : [],
      });
    },
  });
}

export function useCreateSalesReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, input }: { saleId: string; input: CreateSalesReturnInput }) =>
      salesApi.createSalesReturn(saleId, input),
    onSuccess: (_data, variables) => {
      invalidateAfterSale(queryClient);
      queryClient.invalidateQueries({ queryKey: saleKeys.detail(variables.saleId) });
    },
  });
}

export function useCreateSalePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, input }: { saleId: string; input: CreateSalePaymentInput }) =>
      salesApi.createSalePayment(saleId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      queryClient.invalidateQueries({ queryKey: saleKeys.detail(variables.saleId) });
    },
  });
}
