import type {
  CategorySummary,
  ProductSummary,
  ProductVariantSummary,
  StockAdjustmentSummary,
  StockLevelSummary,
  StockMovementSummary,
  StockTransferSummary,
  UnitSummary,
} from "@daljir/types";
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
import { api, apiPaginated, buildQuery, type PaginationMeta } from "@/lib/api";

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  status: string;
}

export interface WarehouseSummary {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  status: string;
  branch: { name: string };
}

export function listBranches() {
  return api<BranchSummary[]>("/branches");
}

export function listWarehouses() {
  return api<WarehouseSummary[]>("/warehouses");
}

export interface ProductListParams {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  status?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  [key: string]: string | number | boolean | undefined;
}

export function listProducts(params: ProductListParams): Promise<{ data: ProductSummary[]; meta: PaginationMeta }> {
  return apiPaginated(`/products${buildQuery(params)}`);
}

export function getProduct(id: string) {
  return api<ProductSummary>(`/products/${id}`);
}

export function createProduct(input: CreateProductInput) {
  return api<ProductSummary>("/products", { method: "POST", body: JSON.stringify(input) });
}

export function updateProduct(id: string, input: UpdateProductInput) {
  return api<ProductSummary>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archiveProduct(id: string) {
  return api<ProductSummary>(`/products/${id}`, { method: "DELETE" });
}

export function listProductVariants(productId: string) {
  return api<ProductVariantSummary[]>(`/products/${productId}/variants`);
}

export function listCategories() {
  return api<CategorySummary[]>("/categories");
}

export function createCategory(input: CreateCategoryInput) {
  return api<CategorySummary>("/categories", { method: "POST", body: JSON.stringify(input) });
}

export function updateCategory(id: string, input: UpdateCategoryInput) {
  return api<CategorySummary>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteCategory(id: string) {
  return api<{ ok: true }>(`/categories/${id}`, { method: "DELETE" });
}

export function listUnits() {
  return api<UnitSummary[]>("/units");
}

export function createUnit(input: CreateUnitInput) {
  return api<UnitSummary>("/units", { method: "POST", body: JSON.stringify(input) });
}

export function updateUnit(id: string, input: UpdateUnitInput) {
  return api<UnitSummary>(`/units/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteUnit(id: string) {
  return api<{ ok: true }>(`/units/${id}`, { method: "DELETE" });
}

export interface StockLevelListParams {
  page: number;
  pageSize: number;
  warehouseId?: string;
  productId?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listStockLevels(params: StockLevelListParams) {
  return apiPaginated<StockLevelSummary[]>(`/inventory/stock-levels${buildQuery(params)}`);
}

export interface LowStockItem extends StockLevelSummary {
  product: { id: string; name: string; sku: string; lowStockThreshold: string | null };
}

export function listLowStock(params: { page: number; pageSize: number; warehouseId?: string }) {
  return apiPaginated<LowStockItem[]>(`/inventory/stock-levels/low-stock${buildQuery(params)}`);
}

export interface StockValuation {
  totalValue: string;
  byWarehouse: { warehouseId: string; value: string }[];
}

export function getStockValuation(warehouseId?: string) {
  return api<StockValuation>(`/inventory/stock-levels/valuation${buildQuery({ warehouseId })}`);
}

export interface StockMovementListParams {
  page: number;
  pageSize: number;
  warehouseId?: string;
  productId?: string;
  type?: string;
  from?: string;
  to?: string;
  [key: string]: string | number | boolean | undefined;
}

export function listStockMovements(params: StockMovementListParams) {
  return apiPaginated<StockMovementSummary[]>(`/inventory/movements${buildQuery(params)}`);
}

export interface StockAdjustmentListParams {
  page: number;
  pageSize: number;
  warehouseId?: string;
  reason?: string;
  [key: string]: string | number | boolean | undefined;
}

export type StockAdjustmentWithItems = StockAdjustmentSummary & {
  items: { id: string; productId: string; variantId: string | null; quantityDelta: string; unitCost: string | null }[];
};

export function listStockAdjustments(params: StockAdjustmentListParams) {
  return apiPaginated<StockAdjustmentWithItems[]>(`/inventory/adjustments${buildQuery(params)}`);
}

export function getStockAdjustment(id: string) {
  return api<StockAdjustmentWithItems>(`/inventory/adjustments/${id}`);
}

export function createStockAdjustment(input: CreateStockAdjustmentInput) {
  return api<StockAdjustmentWithItems>("/inventory/adjustments", { method: "POST", body: JSON.stringify(input) });
}

export interface StockTransferListParams {
  page: number;
  pageSize: number;
  warehouseId?: string;
  status?: string;
  [key: string]: string | number | boolean | undefined;
}

export type StockTransferWithItems = StockTransferSummary & {
  items: {
    id: string;
    productId: string;
    variantId: string | null;
    quantity: string;
    outboundMovementId: string | null;
    inboundMovementId: string | null;
  }[];
};

export function listStockTransfers(params: StockTransferListParams) {
  return apiPaginated<StockTransferWithItems[]>(`/inventory/transfers${buildQuery(params)}`);
}

export function getStockTransfer(id: string) {
  return api<StockTransferWithItems>(`/inventory/transfers/${id}`);
}

export function createStockTransfer(input: CreateStockTransferInput) {
  return api<StockTransferWithItems>("/inventory/transfers", { method: "POST", body: JSON.stringify(input) });
}

export function receiveStockTransfer(id: string, input: ReceiveStockTransferInput) {
  return api<StockTransferWithItems>(`/inventory/transfers/${id}/receive`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}