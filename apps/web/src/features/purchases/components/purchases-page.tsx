"use client";

import type { PurchaseStatus } from "@daljir/types";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateField, SelectField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useListState } from "@/features/inventory/lib/list-state";
import { useWarehouses } from "@/features/inventory/hooks";
import { usePurchases, useSuppliers } from "@/features/purchases/hooks";
import type { PurchaseRecord } from "@/features/purchases/api";
import { PurchaseStatusBadge } from "./status-badges";

const STATUSES: PurchaseStatus[] = ["PENDING", "COMPLETED", "CANCELLED"];

interface Filters {
  supplierId: string;
  warehouseId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

export function PurchasesPage() {
  const t = useTranslations("purchases");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("purchases.create");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({
    supplierId: "",
    warehouseId: "",
    status: "",
    dateFrom: "",
    dateTo: "",
  });

  const suppliers = useSuppliers({ page: 1, pageSize: 100 });
  const warehouses = useWarehouses();
  const purchases = usePurchases({
    page: state.page,
    pageSize: state.pageSize,
    supplierId: state.filters.supplierId || undefined,
    warehouseId: state.filters.warehouseId || undefined,
    status: state.filters.status || undefined,
    dateFrom: state.filters.dateFrom || undefined,
    dateTo: state.filters.dateTo || undefined,
  });

  const supplierNameById = new Map((suppliers.data?.data ?? []).map((supplier) => [supplier.id, supplier.name]));
  const warehouseNameById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.name]));

  const columns: DataTableColumn<PurchaseRecord>[] = [
    {
      id: "purchaseNumber",
      header: t("number"),
      accessor: (row) => (
        <Link href={`/purchases/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.purchaseNumber}
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
    { id: "receivedAt", header: t("receivedAt"), accessor: (row) => formatDateTime(row.receivedAt) },
    { id: "totalAmount", header: t("total"), align: "end", accessor: (row) => formatMoney(row.totalAmount) },
    { id: "amountDue", header: t("amountDue"), align: "end", accessor: (row) => formatMoney(row.amountDue) },
    {
      id: "status",
      header: t("status"),
      align: "center",
      accessor: (row) => <PurchaseStatusBadge status={row.status} label={t(`statusValue.${row.status}`)} />,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? (
          <Link
            href="/purchases/new"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("newReceipt")}
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
          wrapperClassName="w-44"
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
        <DateField
          label={t("dateFrom")}
          wrapperClassName="w-44"
          value={state.filters.dateFrom}
          onChange={(event) => setFilter("dateFrom", event.target.value)}
        />
        <DateField
          label={t("dateTo")}
          wrapperClassName="w-44"
          value={state.filters.dateTo}
          onChange={(event) => setFilter("dateTo", event.target.value)}
        />
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={purchases.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={purchases.isLoading}
          error={purchases.isError ? userFacingError(purchases.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => purchases.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
        />
      </div>

      {purchases.data ? (
        <Pagination
          className="mt-4"
          page={purchases.data.meta.page}
          pageSize={purchases.data.meta.pageSize}
          totalItems={purchases.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
