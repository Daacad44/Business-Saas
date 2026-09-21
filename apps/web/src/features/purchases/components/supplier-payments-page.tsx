"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateField, SelectField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useListState } from "@/features/inventory/lib/list-state";
import { usePayablesPayments, useSuppliers } from "@/features/purchases/hooks";
import type { SupplierPaymentRecord } from "@/features/purchases/api";

interface Filters {
  supplierId: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

export function SupplierPaymentsPage() {
  const t = useTranslations("supplierPayments");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("purchases.create");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({
    supplierId: "",
    dateFrom: "",
    dateTo: "",
  });

  const suppliers = useSuppliers({ page: 1, pageSize: 100 });
  const payments = usePayablesPayments({
    page: state.page,
    pageSize: state.pageSize,
    supplierId: state.filters.supplierId || undefined,
    dateFrom: state.filters.dateFrom || undefined,
    dateTo: state.filters.dateTo || undefined,
  });

  const supplierNameById = new Map((suppliers.data?.data ?? []).map((supplier) => [supplier.id, supplier.name]));

  const columns: DataTableColumn<SupplierPaymentRecord>[] = [
    { id: "paidAt", header: t("paidAt"), accessor: (row) => formatDateTime(row.paidAt) },
    {
      id: "supplier",
      header: t("supplier"),
      accessor: (row) => (
        <Link href={`/suppliers/${row.supplierId}`} className="text-ink hover:underline">
          {supplierNameById.get(row.supplierId) ?? row.supplierId}
        </Link>
      ),
    },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "method", header: t("method"), accessor: (row) => td(`method.${row.method}`) },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
    {
      id: "purchaseId",
      header: t("appliedTo"),
      accessor: (row) =>
        row.purchaseId ? (
          <Link href={`/purchases/${row.purchaseId}`} className="text-ink hover:underline">
            {row.purchaseId.slice(0, 8)}
          </Link>
        ) : (
          t("onAccount")
        ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? (
          <Link
            href="/payments/new"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("recordPayment")}
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
          data={payments.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={payments.isLoading}
          error={payments.isError ? userFacingError(payments.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => payments.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
        />
      </div>

      {payments.data ? (
        <Pagination
          className="mt-4"
          page={payments.data.meta.page}
          pageSize={payments.data.meta.pageSize}
          totalItems={payments.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
