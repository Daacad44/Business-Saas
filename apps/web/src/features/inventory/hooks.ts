import type {
  CreateCategoryInput,
  CreateProductInput,
  CreateStockAdjustmentInput,
  CreateStockTransferInput,
  CreateUnitInput,
  ReceiveStockTransferInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateUnitInput,
} from "@daljir/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as inventoryApi from "./api";

export const inventoryKeys = {
  branches: ["inventory", "branches"] as const,
  warehouses: ["inventory", "warehouses"] as const,
  units: ["inventory", "units"] as const,
  categories: ["inventory", "categories"] as const,
  products: (params?: unknown) => ["inventory", "products", params] as const,
  product: (id: string) => ["inventory", "products", "detail", id] as const,
  productVariants: (productId: string) => ["inventory", "products", "detail", productId, "variants"] as const,
  stockLevels: (params?: unknown) => ["inventory", "stock-levels", params] as const,
  lowStock: (params?: unknown) => ["inventory", "stock-levels", "low-stock", params] as const,
  valuation: (warehouseId?: string) => ["inventory", "stock-levels", "valuation", warehouseId] as const,
  movements: (params?: unknown) => ["inventory", "stock-movements", params] as const,
  adjustments: (params?: unknown) => ["inventory", "stock-adjustments", params] as const,
  adjustment: (id: string) => ["inventory", "stock-adjustments", "detail", id] as const,
  transfers: (params?: unknown) => ["inventory", "stock-transfers", params] as const,
  transfer: (id: string) => ["inventory", "stock-transfers", "detail", id] as const,
};

export function useBranches() {
  return useQuery({ queryKey: inventoryKeys.branches, queryFn: inventoryApi.listBranches });
}

export function useWarehouses() {
  return useQuery({ queryKey: inventoryKeys.warehouses, queryFn: inventoryApi.listWarehouses });
}

export function useUnits() {
  return useQuery({ queryKey: inventoryKeys.units, queryFn: inventoryApi.listUnits });
}

export function useCreateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUnitInput) => inventoryApi.createUnit(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.units }),
  });
}

export function useUpdateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUnitInput }) => inventoryApi.updateUnit(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.units }),
  });
}

export function useDeleteUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.deleteUnit(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.units }),
  });
}

export function useCategories() {
  return useQuery({ queryKey: inventoryKeys.categories, queryFn: inventoryApi.listCategories });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => inventoryApi.createCategory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.categories }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) => inventoryApi.updateCategory(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.categories }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.categories }),
  });
}

export function useProducts(params: inventoryApi.ProductListParams) {
  return useQuery({
    queryKey: inventoryKeys.products(params),
    queryFn: () => inventoryApi.listProducts(params),
    placeholderData: (previous) => previous,
  });
}

export function useProduct(id: string) {
  return useQuery({ queryKey: inventoryKeys.product(id), queryFn: () => inventoryApi.getProduct(id) });
}

export function useProductVariants(productId: string) {
  return useQuery({
    queryKey: inventoryKeys.productVariants(productId),
    queryFn: () => inventoryApi.listProductVariants(productId),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => inventoryApi.createProduct(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "products"] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) => inventoryApi.updateProduct(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.product(variables.id) });
    },
  });
}

export function useArchiveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.archiveProduct(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.product(id) });
    },
  });
}

export function useStockLevels(params: inventoryApi.StockLevelListParams) {
  return useQuery({
    queryKey: inventoryKeys.stockLevels(params),
    queryFn: () => inventoryApi.listStockLevels(params),
    placeholderData: (previous) => previous,
  });
}

export function useLowStock(params: { page: number; pageSize: number; warehouseId?: string }) {
  return useQuery({
    queryKey: inventoryKeys.lowStock(params),
    queryFn: () => inventoryApi.listLowStock(params),
    placeholderData: (previous) => previous,
  });
}

export function useStockValuation(warehouseId?: string) {
  return useQuery({
    queryKey: inventoryKeys.valuation(warehouseId),
    queryFn: () => inventoryApi.getStockValuation(warehouseId),
  });
}

export function useStockMovements(params: inventoryApi.StockMovementListParams) {
  return useQuery({
    queryKey: inventoryKeys.movements(params),
    queryFn: () => inventoryApi.listStockMovements(params),
    placeholderData: (previous) => previous,
  });
}

export function useStockAdjustments(params: inventoryApi.StockAdjustmentListParams) {
  return useQuery({
    queryKey: inventoryKeys.adjustments(params),
    queryFn: () => inventoryApi.listStockAdjustments(params),
    placeholderData: (previous) => previous,
  });
}

export function useStockAdjustment(id: string) {
  return useQuery({ queryKey: inventoryKeys.adjustment(id), queryFn: () => inventoryApi.getStockAdjustment(id) });
}

function invalidateStockSideEffects(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-movements"] });
}

export function useCreateStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStockAdjustmentInput) => inventoryApi.createStockAdjustment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-adjustments"] });
      invalidateStockSideEffects(queryClient);
    },
  });
}

export function useStockTransfers(params: inventoryApi.StockTransferListParams) {
  return useQuery({
    queryKey: inventoryKeys.transfers(params),
    queryFn: () => inventoryApi.listStockTransfers(params),
    placeholderData: (previous) => previous,
  });
}

export function useStockTransfer(id: string) {
  return useQuery({ queryKey: inventoryKeys.transfer(id), queryFn: () => inventoryApi.getStockTransfer(id) });
}

export function useCreateStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStockTransferInput) => inventoryApi.createStockTransfer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-transfers"] });
      invalidateStockSideEffects(queryClient);
    },
  });
}

export function useReceiveStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReceiveStockTransferInput }) =>
      inventoryApi.receiveStockTransfer(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.transfer(variables.id) });
      invalidateStockSideEffects(queryClient);
    },
  });
}
