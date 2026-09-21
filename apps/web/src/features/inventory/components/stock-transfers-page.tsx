"use client";

import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { SelectField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import type { StockTransferWithItems } from "@/features/inventory/api";
import { useReceiveStockTransfer, useStockTransfers, useWarehouses } from "@/features/inventory/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import type { StockTransferStatus } from "@daljir/types";

const STATUSES: StockTransferStatus[] = ["PENDING", "IN_TRANSIT", "COMPLETED", "CANCELLED"];

const STATUS_VARIANT: Record<StockTransferStatus, "neutral" | "info" | "success" | "danger"> = {
  PENDING: "neutral",
  IN_TRANSIT: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
};

interface Filters {
  warehouseId: string;
  status: string;
  [key: string]: string;
}

export function StockTransfersPage() {
  const t = useTranslations("stockTransfers");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canTransfer = useHasPermission("inventory.transfer");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({ warehouseId: "", status: "" });
  const warehouses = useWarehouses();
  const transfers = useStockTransfers({
    page: state.page,
    pageSize: state.pageSize,
    warehouseId: state.filters.warehouseId || undefined,
    status: state.filters.status || undefined,
  });
  const receiveTransfer = useReceiveStockTransfer();

  const [receivingTransfer, setReceivingTransfer] = React.useState<StockTransferWithItems | null>(null);

  const warehouseNameById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.name]));

  async function confirmReceive() {
    if (!receivingTransfer) return;
    try {
      await receiveTransfer.mutateAsync({ id: receivingTransfer.id, input: {} });
      toast({ title: t("received"), variant: "success" });
      setReceivingTransfer(null);
    } catch (error) {
      toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
    }
  }

  const columns: DataTableColumn<StockTransferWithItems>[] = [
    { id: "createdAt", header: t("date"), accessor: (row) => formatDateTime(row.createdAt) },
    {
      id: "from",
      header: t("fromWarehouse"),
      accessor: (row) => warehouseNameById.get(row.fromWarehouseId) ?? row.fromWarehouseId,
    },
    {
      id: "to",
      header: t("toWarehouse"),
      accessor: (row) => warehouseNameById.get(row.toWarehouseId) ?? row.toWarehouseId,
    },
    { id: "items", header: t("itemCount"), align: "end", accessor: (row) => row.items.length },
    {
      id: "status",
      header: t("statusLabel"),
      align: "center",
      accessor: (row) => <Badge variant={STATUS_VARIANT[row.status]}>{t(`status.${row.status}`)}</Badge>,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canTransfer ? (
          <Link
            href="/inventory/stock-transfers/new"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("newTransfer")}
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
          label={t("statusLabel")}
          wrapperClassName="w-48"
          value={state.filters.status}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={transfers.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={transfers.isLoading}
          error={transfers.isError ? userFacingError(transfers.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => transfers.refetch()}
          emptyTitle={t("empty")}
          rowActions={
            canTransfer
              ? (row) =>
                  row.status === "IN_TRANSIT" ? (
                    <Button size="sm" variant="ghost" onClick={() => setReceivingTransfer(row)}>
                      {t("receive")}
                    </Button>
                  ) : null
              : undefined
          }
        />
      </div>

      {transfers.data ? (
        <Pagination
          className="mt-4"
          page={transfers.data.meta.page}
          pageSize={transfers.data.meta.pageSize}
          totalItems={transfers.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(receivingTransfer)}
        onClose={() => setReceivingTransfer(null)}
        onConfirm={confirmReceive}
        title={t("receiveTitle")}
        description={t("receiveBody")}
        pending={receiveTransfer.isPending}
      />
    </div>
  );
}
