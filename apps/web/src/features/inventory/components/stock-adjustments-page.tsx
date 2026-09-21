"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SelectField } from "@/components/ui/form-field";
import { formatDateTime } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import type { StockAdjustmentWithItems } from "@/features/inventory/api";
import { useStockAdjustments, useWarehouses } from "@/features/inventory/hooks";
import { useListState } from "@/features/inventory/lib/list-state";

const REASONS = ["DAMAGE", "THEFT", "EXPIRY", "RECOUNT", "OTHER"] as const;

interface Filters {
  warehouseId: string;
  reason: string;
  [key: string]: string;
}

export function StockAdjustmentsPage() {
  const t = useTranslations("stockAdjustments");
  const tc = useTranslations("common");
  const canAdjust = useHasPermission("inventory.adjust");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({ warehouseId: "", reason: "" });
  const warehouses = useWarehouses();
  const adjustments = useStockAdjustments({
    page: state.page,
    pageSize: state.pageSize,
    warehouseId: state.filters.warehouseId || undefined,
    reason: state.filters.reason || undefined,
  });

  const warehouseNameById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.name]));

  const columns: DataTableColumn<StockAdjustmentWithItems>[] = [
    { id: "createdAt", header: t("date"), accessor: (row) => formatDateTime(row.createdAt) },
    {
      id: "warehouse",
      header: t("warehouse"),
      accessor: (row) => warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
    },
    { id: "reason", header: t("reasonLabel"), accessor: (row) => <Badge variant="info">{t(`reason.${row.reason}`)}</Badge> },
    { id: "items", header: t("itemCount"), align: "end", accessor: (row) => row.items.length },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canAdjust ? (
          <Link
            href="/inventory/stock-adjustments/new"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("newAdjustment")}
          </Link>
        ) : null}
      </div>

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
          label={t("reasonLabel")}
          wrapperClassName="w-48"
          value={state.filters.reason}
          onChange={(event) => setFilter("reason", event.target.value)}
        >
          <option value="">{t("allReasons")}</option>
          {REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {t(`reason.${reason}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={adjustments.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={adjustments.isLoading}
          error={adjustments.isError ? userFacingError(adjustments.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => adjustments.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={canAdjust ? t("emptyDescription") : undefined}
        />
      </div>

      {adjustments.data ? (
        <Pagination
          className="mt-4"
          page={adjustments.data.meta.page}
          pageSize={adjustments.data.meta.pageSize}
          totalItems={adjustments.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
