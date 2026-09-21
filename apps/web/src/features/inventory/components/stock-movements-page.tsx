"use client";

import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { DateField, SelectField } from "@/components/ui/form-field";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { errorMessage } from "@/lib/api-errors";
import { useProducts, useStockMovements, useWarehouses } from "@/features/inventory/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import type { StockMovementSummary, StockMovementType } from "@daljir/types";

const MOVEMENT_TYPES: StockMovementType[] = [
  "PURCHASE_IN",
  "SALE_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RETURN_IN",
  "RETURN_OUT",
  "OPENING_BALANCE",
];

interface Filters {
  warehouseId: string;
  productId: string;
  type: string;
  from: string;
  to: string;
  [key: string]: string;
}

export function StockMovementsPage() {
  const t = useTranslations("stockMovements");
  const tc = useTranslations("common");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({
    warehouseId: "",
    productId: "",
    type: "",
    from: "",
    to: "",
  });

  const warehouses = useWarehouses();
  const products = useProducts({ page: 1, pageSize: 100 });
  const movements = useStockMovements({
    page: state.page,
    pageSize: state.pageSize,
    warehouseId: state.filters.warehouseId || undefined,
    productId: state.filters.productId || undefined,
    type: state.filters.type || undefined,
    from: state.filters.from || undefined,
    to: state.filters.to || undefined,
  });

  const warehouseNameById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.name]));
  const productNameById = new Map((products.data?.data ?? []).map((product) => [product.id, product.name]));

  const columns: DataTableColumn<StockMovementSummary>[] = [
    { id: "createdAt", header: t("date"), sortable: false, accessor: (row) => formatDateTime(row.createdAt) },
    { id: "type", header: t("typeLabel"), accessor: (row) => t(`type.${row.type}`) },
    {
      id: "product",
      header: t("product"),
      accessor: (row) => productNameById.get(row.productId) ?? row.productId,
    },
    {
      id: "warehouse",
      header: t("warehouse"),
      accessor: (row) => warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
    },
    { id: "quantity", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "reference", header: t("reference"), accessor: (row) => row.referenceType ?? "—" },
  ];

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SelectField
          label={t("warehouse")}
          wrapperClassName="w-48"
          value={state.filters.warehouseId}
          onChange={(event) => setFilter("warehouseId", event.target.value)}
        >
          <option value="">{t("allWarehouses")}</option>
          {(warehouses.data ?? []).map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("product")}
          wrapperClassName="w-48"
          value={state.filters.productId}
          onChange={(event) => setFilter("productId", event.target.value)}
        >
          <option value="">{t("allProducts")}</option>
          {(products.data?.data ?? []).map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("typeLabel")}
          wrapperClassName="w-48"
          value={state.filters.type}
          onChange={(event) => setFilter("type", event.target.value)}
        >
          <option value="">{t("allTypes")}</option>
          {MOVEMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`type.${type}`)}
            </option>
          ))}
        </SelectField>
        <DateField
          label={t("from")}
          value={state.filters.from}
          onChange={(event) => setFilter("from", event.target.value)}
        />
        <DateField
          label={t("to")}
          value={state.filters.to}
          onChange={(event) => setFilter("to", event.target.value)}
        />
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={movements.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={movements.isLoading}
          error={movements.isError ? errorMessage(movements.error, tc("error")) : undefined}
          onRetry={() => movements.refetch()}
          emptyTitle={t("empty")}
        />
      </div>

      {movements.data ? (
        <Pagination
          className="mt-4"
          page={movements.data.meta.page}
          pageSize={movements.data.meta.pageSize}
          totalItems={movements.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
