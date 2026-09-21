"use client";

import type { PurchaseOrderStatus } from "@daljir/types";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SelectField } from "@/components/ui/form-field";
import { formatDate, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useListState } from "@/features/inventory/lib/list-state";
import { useWarehouses } from "@/features/inventory/hooks";
import { usePurchaseOrders, useSuppliers } from "@/features/purchases/hooks";
import type { PurchaseOrderRecord } from "@/features/purchases/api";
import { PurchaseOrderStatusBadge } from "./status-badges";

const STATUSES: PurchaseOrderStatus[] = ["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

interface Filters {
  supplierId: string;
  warehouseId: string;
  status: string;
  [key: string]: string;
}

export function PurchaseOrdersPage() {
  const t = useTranslations("purchaseOrders");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("purchases.create");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({
    supplierId: "",
    warehouseId: "",
    status: "",
  });

  const suppliers = useSuppliers({ page: 1, pageSize: 100 });
  const warehouses = useWarehouses();
  const orders = usePurchaseOrders({
    page: state.page,
    pageSize: state.pageSize,
    supplierId: state.filters.supplierId || undefined,
    warehouseId: state.filters.warehouseId || undefined,
    status: state.filters.status || undefined,
  });

  const supplierNameById = new Map((suppliers.data?.data ?? []).map((supplier) => [supplier.id, supplier.name]));
  const warehouseNameById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.name]));

  const columns: DataTableColumn<PurchaseOrderRecord>[] = [
    {
      id: "orderNumber",
      header: t("number"),
      accessor: (row) => (
        <Link href={`/purchase-orders/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.orderNumber}
        </Link>
      ),
    },
    {
      id: "supplier",
      header: t("supplier"),
      accessor: (row) => supplierNameById.get(row.supplierId) ?? row.supplierId,
    },
    {
      id: "warehouse",
      header: t("warehouse"),
      accessor: (row) => warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
    },
    { id: "expectedAt", header: t("expectedAt"), accessor: (row) => (row.expectedAt ? formatDate(row.expectedAt) : "—") },
    { id: "totalAmount", header: t("total"), align: "end", accessor: (row) => formatMoney(row.totalAmount) },
    {
      id: "status",
      header: t("status"),
      align: "center",
      accessor: (row) => <PurchaseOrderStatusBadge status={row.status} label={t(`statusValue.${row.status}`)} />,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? (
          <Link
            href="/purchase-orders/new"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("newOrder")}
          </Link>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SelectField
          label={t("supplier")}
          wrapperClassName="w-56"
          value={state.filters.supplierId}
          onChange={(event) => setFilter("supplierId", event.target.value)}
        >
          <option value="">{t("allSuppliers")}</option>
          {(suppliers.data?.data ?? []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </SelectField>
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
          label={t("status")}
          wrapperClassName="w-48"
          value={state.filters.status}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`statusValue.${status}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={orders.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={orders.isLoading}
          error={orders.isError ? userFacingError(orders.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => orders.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
        />
      </div>

      {orders.data ? (
        <Pagination
          className="mt-4"
          page={orders.data.meta.page}
          pageSize={orders.data.meta.pageSize}
          totalItems={orders.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
