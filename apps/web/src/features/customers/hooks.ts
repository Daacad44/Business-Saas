import type {
  CreateCustomerAddressInput,
  CreateCustomerInput,
  CreateCustomerNoteInput,
  UpdateCustomerInput,
} from "@daljir/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as customersApi from "./api";

export const customerKeys = {
  list: (params?: unknown) => ["customers", "list", params] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
  credit: (id: string) => ["customers", "detail", id, "credit"] as const,
  addresses: (id: string) => ["customers", "detail", id, "addresses"] as const,
  notes: (id: string) => ["customers", "detail", id, "notes"] as const,
  debts: (id: string) => ["customers", "detail", id, "debts"] as const,
  payments: (id: string) => ["customers", "detail", id, "payments"] as const,
  sales: (id: string, params?: unknown) => ["customers", "detail", id, "sales", params] as const,
};

export function useCustomers(params: customersApi.CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => customersApi.listCustomers(params),
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: string) {
  return useQuery({ queryKey: customerKeys.detail(id), queryFn: () => customersApi.getCustomer(id) });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => customersApi.createCustomer(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers", "list"] }),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) => customersApi.updateCustomer(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.id) });
    },
  });
}

export function useDisableCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customersApi.disableCustomer(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
    },
  });
}

export function useUpdateCreditLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, creditLimit }: { id: string; creditLimit: number }) =>
      customersApi.updateCreditLimit(id, creditLimit),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.credit(variables.id) });
    },
  });
}

export function useAvailableCredit(id: string) {
  return useQuery({ queryKey: customerKeys.credit(id), queryFn: () => customersApi.getAvailableCredit(id) });
}

export function useCustomerAddresses(id: string) {
  return useQuery({ queryKey: customerKeys.addresses(id), queryFn: () => customersApi.listAddresses(id) });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: CreateCustomerAddressInput }) =>
      customersApi.createAddress(customerId, input),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: customerKeys.addresses(variables.customerId) }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, addressId }: { customerId: string; addressId: string }) =>
      customersApi.deleteAddress(customerId, addressId),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: customerKeys.addresses(variables.customerId) }),
  });
}

export function useCustomerNotes(id: string) {
  return useQuery({ queryKey: customerKeys.notes(id), queryFn: () => customersApi.listNotes(id) });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: CreateCustomerNoteInput }) =>
      customersApi.createNote(customerId, input),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: customerKeys.notes(variables.customerId) }),
  });
}

export function useCustomerDebts(id: string) {
  return useQuery({ queryKey: customerKeys.debts(id), queryFn: () => customersApi.listCustomerDebts(id) });
}

export function useCustomerPayments(id: string) {
  return useQuery({ queryKey: customerKeys.payments(id), queryFn: () => customersApi.listCustomerPayments(id) });
}

export function useCustomerSales(id: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: customerKeys.sales(id, { page, pageSize }),
    queryFn: () => customersApi.listCustomerSales(id, page, pageSize),
    placeholderData: (previous) => previous,
  });
}
