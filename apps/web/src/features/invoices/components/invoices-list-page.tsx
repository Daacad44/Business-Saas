"use client";

import type { CustomerSummary, InvoiceStatus, InvoiceSummary } from "@daljir/types";
import Link from "next/link";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateField, SelectField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { useListState } from "@/features/inventory/lib/list-state";
import { CustomerPicker } from "@/features/pos/components/customer-picker";
import { formatDate, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useInvoices } from "../hooks";

const STATUSES: InvoiceStatus[] = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"];

const STATUS_VARIANT: Record<InvoiceStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "neutral",
};

interface Filters {
  status: string;
  customerId: string;
  overdueOnly: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

export function InvoicesListPage() {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");

  const { state, setPage, setPageSize, setSearch, setFilter } = useListState<Filters>({
    status: "",
    customerId: "",
    overdueOnly: "",
    dateFrom: "",
    dateTo: "",
  });

  const [filterCustomer, setFilterCustomer] = React.useState<CustomerSummary | null>(null);

  const invoices = useInvoices({
    page: state.page,
    pageSize: state.pageSize,
    search: state.search || undefined,
    status: state.filters.status || undefined,
    customerId: state.filters.customerId || undefined,
    overdueOnly: state.filters.overdueOnly === "true" ? true : undefined,
    dateFrom: state.filters.dateFrom || undefined,
    dateTo: state.filters.dateTo || undefined,
  });

  const columns: DataTableColumn<InvoiceSummary>[] = [
    {
      id: "invoiceNumber",
      header: t("invoiceNumber"),
      accessor: (row) => (
        <Link href={`/invoices/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.invoiceNumber}
        </Link>
      ),
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
      id: "issuedAt",
      header: t("issuedAt"),
      accessor: (row) => formatDate(row.issuedAt),
    },
    {
      id: "dueDate",
      header: t("dueDate"),
      accessor: (row) => (row.dueDate ? formatDate(row.dueDate) : "—"),
    },
    {
      id: "totalAmount",
      header: t("total"),
      align: "end",
      accessor: (row) => formatMoney(row.totalAmount),
    },
    {
      id: "amountDue",
      header: t("amountDue"),
      align: "end",
      accessor: (row) => formatMoney(row.amountDue),
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
      <h1 className="font-display text-4xl">{t("title")}</h1>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SearchInput
          value={state.search}
          onValueChange={setSearch}
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-sm"
        />
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
          label={t("overdueOnly")}
          wrapperClassName="w-40"
          value={state.filters.overdueOnly}
          onChange={(event) => setFilter("overdueOnly", event.target.value)}
        >
          <option value="">{t("no")}</option>
          <option value="true">{t("yes")}</option>
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
          data={invoices.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={invoices.isLoading}
          error={invoices.isError ? userFacingError(invoices.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => invoices.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
        />
      </div>

      {invoices.data ? (
        <Pagination
          className="mt-4"
          page={invoices.data.meta.page}
          pageSize={invoices.data.meta.pageSize}
          totalItems={invoices.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
