"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Boxes, DollarSign } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { SelectField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatMoney, formatQuantity } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import type { LowStockItem } from "@/features/inventory/api";
import { useLowStock, useProducts, useStockLevels, useStockValuation, useWarehouses } from "@/features/inventory/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import type { StockLevelSummary } from "@daljir/types";

interface Filters {
  warehouseId: string;
  [key: string]: string;
}

export function StockLevelsPage() {
  const t = useTranslations("stockLevels");
  const tc = useTranslations("common");
  const [tab, setTab] = React.useState("all");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({ warehouseId: "" });

  const warehouses = useWarehouses();
  const products = useProducts({ page: 1, pageSize: 100 });
  const valuation = useStockValuation(state.filters.warehouseId || undefined);

  const stockLevels = useStockLevels({
    page: state.page,
    pageSize: state.pageSize,
    warehouseId: state.filters.warehouseId || undefined,
  });
  const lowStock = useLowStock({
    page: state.page,
    pageSize: state.pageSize,
    warehouseId: state.filters.warehouseId || undefined,
  });

  const warehouseNameById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.name]));
  const productById = new Map((products.data?.data ?? []).map((product) => [product.id, product]));

  const levelColumns: DataTableColumn<StockLevelSummary>[] = [
    {
      id: "product",
      header: t("product"),
      accessor: (row) => productById.get(row.productId)?.name ?? row.productId,
    },
    {
      id: "warehouse",
      header: t("warehouse"),
      accessor: (row) => warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
    },
    { id: "quantity", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    {
      id: "reserved",
      header: t("reservedQuantity"),
      align: "end",
      accessor: (row) => formatQuantity(row.reservedQuantity),
    },
  ];

  const lowStockColumns: DataTableColumn<LowStockItem>[] = [
    { id: "product", header: t("product"), accessor: (row) => row.product.name },
    { id: "sku", header: t("sku"), accessor: (row) => row.product.sku },
    {
      id: "warehouse",
      header: t("warehouse"),
      accessor: (row) => warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
    },
    { id: "quantity", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    {
      id: "threshold",
      header: t("lowStockThreshold"),
      align: "end",
      accessor: (row) => formatQuantity(row.product.lowStockThreshold ?? "0"),
    },
  ];

  const activeList = tab === "low-stock" ? lowStock : stockLevels;

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>

      <div className="mt-6">
        {valuation.isError ? (
          <ErrorState
            description={userFacingError(valuation.error, t("valuationError"), tc("forbidden"))}
            onRetry={() => valuation.refetch()}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={t("totalValuation")}
              value={valuation.isLoading ? <Skeleton className="h-8 w-28" /> : formatMoney(valuation.data?.totalValue ?? "0")}
              icon={DollarSign}
            />
            <StatCard
              label={t("trackedWarehouses")}
              value={valuation.isLoading ? <Skeleton className="h-8 w-12" /> : (valuation.data?.byWarehouse.length ?? 0)}
              icon={Boxes}
            />
            <StatCard
              label={t("lowStockCount")}
              value={lowStock.isLoading ? <Skeleton className="h-8 w-12" /> : (lowStock.data?.meta.total ?? 0)}
              icon={AlertTriangle}
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <Tabs
          label={t("title")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "all", label: t("tabAll") },
            { value: "low-stock", label: t("tabLowStock") },
          ]}
        />
        <SelectField
          label={t("warehouse")}
          wrapperClassName="w-56"
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
      </div>

      <TabPanel value="all" activeValue={tab} className="mt-6">
        <DataTable
          caption={t("tabAll")}
          columns={levelColumns}
          data={stockLevels.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={stockLevels.isLoading}
          error={stockLevels.isError ? userFacingError(stockLevels.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => stockLevels.refetch()}
          emptyTitle={t("empty")}
        />
      </TabPanel>
      <TabPanel value="low-stock" activeValue={tab} className="mt-6">
        <DataTable
          caption={t("tabLowStock")}
          columns={lowStockColumns}
          data={lowStock.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={lowStock.isLoading}
          error={lowStock.isError ? userFacingError(lowStock.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => lowStock.refetch()}
          emptyTitle={t("emptyLowStock")}
        />
      </TabPanel>

      {activeList.data ? (
        <Pagination
          className="mt-4"
          page={activeList.data.meta.page}
          pageSize={activeList.data.meta.pageSize}
          totalItems={activeList.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
