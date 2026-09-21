"use client";

import type { CustomerDebtSummary, DebtStatus } from "@daljir/types";
import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { DateField, SelectField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatMoney, formatDate } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useCustomers } from "@/features/customers/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import { useAgingReport, useDebts, useDueTodayDebts, useOverdueDebts } from "@/features/debts/hooks";

const STATUSES: DebtStatus[] = [
  "PENDING",
  "DUE_SOON",
  "DUE_TODAY",
  "OVERDUE",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
];

const STATUS_VARIANT: Record<DebtStatus, "neutral" | "info" | "warning" | "danger" | "success"> = {
  PENDING: "neutral",
  DUE_SOON: "info",
  DUE_TODAY: "warning",
  OVERDUE: "danger",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "neutral",
};

interface Filters {
  customerId: string;
  status: string;
  overdueOnly: string;
  dueDateFrom: string;
  dueDateTo: string;
  [key: string]: string;
}

function useDebtColumns(customerNameById: Map<string, string>) {
  const t = useTranslations("debts");
  const columns: DataTableColumn<CustomerDebtSummary>[] = [
    {
      id: "id",
      header: t("debt"),
      accessor: (row) => (
        <Link href={`/debts/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      id: "customer",
      header: t("customer"),
      accessor: (row) => customerNameById.get(row.customerId) ?? row.customerId,
    },
    { id: "dueDate", header: t("dueDate"), accessor: (row) => formatDate(row.dueDate) },
    {
      id: "outstanding",
      header: t("outstandingAmount"),
      align: "end",
      accessor: (row) => formatMoney(row.outstandingAmount),
    },
    {
      id: "status",
      header: t("statusLabel"),
      align: "center",
      accessor: (row) => <Badge variant={STATUS_VARIANT[row.status]}>{t(`status.${row.status}`)}</Badge>,
    },
  ];
  return columns;
}

export function DebtsPage() {
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const [tab, setTab] = React.useState("all");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({
    customerId: "",
    status: "",
    overdueOnly: "",
    dueDateFrom: "",
    dueDateTo: "",
  });

  const customers = useCustomers({ page: 1, pageSize: 100 });
  const customerNameById = new Map((customers.data?.data ?? []).map((customer) => [customer.id, customer.fullName]));

  const debts = useDebts({
    page: state.page,
    pageSize: state.pageSize,
    customerId: state.filters.customerId || undefined,
    status: state.filters.status || undefined,
    overdueOnly: state.filters.overdueOnly === "true",
    dueDateFrom: state.filters.dueDateFrom || undefined,
    dueDateTo: state.filters.dueDateTo || undefined,
  });
  const overdueDebts = useOverdueDebts();
  const dueTodayDebts = useDueTodayDebts();
  const aging = useAgingReport();

  const columns = useDebtColumns(customerNameById);

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>

      <div className="mt-6">
        <Tabs
          label={t("title")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "all", label: t("tabAll") },
            { value: "overdue", label: t("tabOverdue") },
            { value: "due-today", label: t("tabDueToday") },
            { value: "aging", label: t("tabAging") },
          ]}
        />
      </div>

      <TabPanel value="all" activeValue={tab} className="mt-6">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t("customer")}
            wrapperClassName="w-56"
            value={state.filters.customerId}
            onChange={(event) => setFilter("customerId", event.target.value)}
          >
            <option value="">{t("allCustomers")}</option>
            {(customers.data?.data ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName}
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
            label={t("dueDateFrom")}
            value={state.filters.dueDateFrom}
            onChange={(event) => setFilter("dueDateFrom", event.target.value)}
          />
          <DateField
            label={t("dueDateTo")}
            value={state.filters.dueDateTo}
            onChange={(event) => setFilter("dueDateTo", event.target.value)}
          />
        </div>

        <div className="mt-6">
          <DataTable
            caption={t("tabAll")}
            columns={columns}
            data={debts.data?.data ?? []}
            getRowId={(row) => row.id}
            isLoading={debts.isLoading}
            error={debts.isError ? userFacingError(debts.error, tc("error"), tc("forbidden")) : undefined}
            onRetry={() => debts.refetch()}
            emptyTitle={t("empty")}
          />
        </div>

        {debts.data ? (
          <Pagination
            className="mt-4"
            page={debts.data.meta.page}
            pageSize={debts.data.meta.pageSize}
            totalItems={debts.data.meta.total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="overdue" activeValue={tab} className="mt-6">
        <DataTable
          caption={t("tabOverdue")}
          columns={columns}
          data={overdueDebts.data ?? []}
          getRowId={(row) => row.id}
          isLoading={overdueDebts.isLoading}
          error={overdueDebts.isError ? userFacingError(overdueDebts.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => overdueDebts.refetch()}
          emptyTitle={t("emptyOverdue")}
        />
      </TabPanel>

      <TabPanel value="due-today" activeValue={tab} className="mt-6">
        <DataTable
          caption={t("tabDueToday")}
          columns={columns}
          data={dueTodayDebts.data ?? []}
          getRowId={(row) => row.id}
          isLoading={dueTodayDebts.isLoading}
          error={dueTodayDebts.isError ? userFacingError(dueTodayDebts.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => dueTodayDebts.refetch()}
          emptyTitle={t("emptyDueToday")}
        />
      </TabPanel>

      <TabPanel value="aging" activeValue={tab} className="mt-6">
        {aging.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-3xl" />
            ))}
          </div>
        ) : aging.isError ? (
          <ErrorState
            description={userFacingError(aging.error, tc("error"), tc("forbidden"))}
            onRetry={() => aging.refetch()}
          />
        ) : aging.data ? (
          <div>
            <div className="grid gap-4 sm:grid-cols-5">
              <StatCard label={t("bucketCurrent")} value={formatMoney(aging.data.buckets.current.total)} />
              <StatCard label={t("bucket1to30")} value={formatMoney(aging.data.buckets["1-30"].total)} />
              <StatCard label={t("bucket31to60")} value={formatMoney(aging.data.buckets["31-60"].total)} />
              <StatCard label={t("bucket61to90")} value={formatMoney(aging.data.buckets["61-90"].total)} />
              <StatCard label={t("bucket90plus")} value={formatMoney(aging.data.buckets["90+"].total)} />
            </div>
            <p className="mt-4 text-sm text-muted">
              {t("totalOutstanding")}: <span className="font-semibold text-ink">{formatMoney(aging.data.totalOutstanding)}</span>
            </p>
          </div>
        ) : (
          <EmptyState title={t("empty")} />
        )}
      </TabPanel>
    </div>
  );
}
