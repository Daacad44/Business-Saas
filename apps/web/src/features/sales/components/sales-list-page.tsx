"use client";

import type { CustomerSummary, SaleStatus, SaleSummary, SaleType } from "@daljir/types";
import Link from "next/link";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateField, SelectField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { useBranches, useWarehouses } from "@/features/inventory/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import { CustomerPicker } from "@/features/pos/components/customer-picker";
import { formatDateTime, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useSales } from "../hooks";

const TYPES: SaleType[] = ["CASH", "CREDIT"];
const STATUSES: SaleStatus[] = ["DRAFT", "COMPLETED", "VOIDED"];

const STATUS_VARIANT: Record<SaleStatus, "neutral" | "success" | "danger"> = {
  DRAFT: "neutral",
  COMPLETED: "success",
  VOIDED: "danger",
};

interface Filters {
  branchId: string;
  warehouseId: string;
  customerId: string;
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

export function SalesListPage() {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("sales.create");

  const { state, setPage, setPageSize, setSearch, setFilter, toggleSort } = useListState<Filters>(
    { branchId: "", warehouseId: "", customerId: "", type: "", status: "", dateFrom: "", dateTo: "" },
    "soldAt",
  );

  const branches = useBranches();
  const warehouses = useWarehouses();
  const [filterCustomer, setFilterCustomer] = React.useState<CustomerSummary | null>(null);

  const sales = useSales({
    page: state.page,
    pageSize: state.pageSize,
    search: state.search || undefined,
    branchId: state.filters.branchId || undefined,
    warehouseId: state.filters.warehouseId || undefined,
    customerId: state.filters.customerId || undefined,
    type: state.filters.type || undefined,
    status: state.filters.status || undefined,
    dateFrom: state.filters.dateFrom || undefined,
    dateTo: state.filters.dateTo || undefined,
    sortBy: state.sortBy,
    sortOrder: state.sortDirection,
  });

  const columns: DataTableColumn<SaleSummary>[] = [
    {
      id: "saleNumber",
      header: t("saleNumber"),
      sortable: true,
      accessor: (row) => (
        <Link href={`/sales/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.saleNumber}
        </Link>
      ),
    },
    {
      id: "soldAt",
      header: t("date"),
      sortable: true,
      accessor: (row) => formatDateTime(row.soldAt),
    },
    {
      id: "type",
      header: t("type"),
      accessor: (row) => (row.type === "CASH" ? t("typeCash") : t("typeCredit")),
    },
    {
      id: "customer",
      header: t("customer"),
      accessor: (row) =>
        row.customerId
          ? filterCustomer?.id === row.customerId
            ? filterCustomer.fullName
            : row.customerId.slice(0, 8)
          : "—",
    },
    {
      id: "totalAmount",
      header: t("total"),
      sortable: true,
      align: "end",
      accessor: (row) => formatMoney(row.totalAmount),
    },
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
        {canCreate ? (
          <Link href="/pos">
            <Button>{t("newSale")}</Button>
          </Link>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SearchInput
          value={state.search}
          onValueChange={setSearch}
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-sm"
        />
        <SelectField
          label={t("branch")}
          wrapperClassName="w-44"
          value={state.filters.branchId}
          onChange={(event) => setFilter("branchId", event.target.value)}
        >
          <option value="">{t("allBranches")}</option>
          {(branches.data ?? []).map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("warehouse")}
          wrapperClassName="w-44"
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
        <div className="w-52">
          <CustomerPicker
            label={t("customer")}
            value={filterCustomer}
            onChange={(customer) => {
              setFilterCustomer(customer);
              setFilter("customerId", customer?.id ?? "");
            }}
          />
        </div>
        <SelectField
          label={t("type")}
          wrapperClassName="w-36"
          value={state.filters.type}
          onChange={(event) => setFilter("type", event.target.value)}
        >
          <option value="">{t("allTypes")}</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {type === "CASH" ? t("typeCash") : t("typeCredit")}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("statusLabel")}
          wrapperClassName="w-40"
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
        <DateField
          label={t("dateFrom")}
          value={state.filters.dateFrom}
          onChange={(event) => setFilter("dateFrom", event.target.value)}
        />
        <DateField
          label={t("dateTo")}
          value={state.filters.dateTo}
          onChange={(event) => setFilter("dateTo", event.target.value)}
        />
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={sales.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={sales.isLoading}
          error={sales.isError ? userFacingError(sales.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => sales.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
          sortBy={state.sortBy}
          sortDirection={state.sortDirection}
          onSortChange={toggleSort}
        />
      </div>

      {sales.data ? (
        <Pagination
          className="mt-4"
          page={sales.data.meta.page}
          pageSize={sales.data.meta.pageSize}
          totalItems={sales.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
