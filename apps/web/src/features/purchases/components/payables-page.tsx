"use client";

import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { SelectField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useListState } from "@/features/inventory/lib/list-state";
import { useOutstandingPayables, usePayablesAging, useSuppliers } from "@/features/purchases/hooks";
import type { OutstandingPayable, PayablesAging } from "@/features/purchases/api";

const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

function OutstandingTab() {
  const t = useTranslations("payables");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("purchases.create");
  const { state, setPage, setPageSize } = useListState({});
  const payables = useOutstandingPayables({ page: state.page, pageSize: state.pageSize });

  const columns: DataTableColumn<OutstandingPayable>[] = [
    {
      id: "supplier",
      header: t("supplier"),
      accessor: (row) => (
        <Link href={`/suppliers/${row.supplierId}`} className="font-semibold text-ink hover:underline">
          {row.supplierName}
        </Link>
      ),
    },
    {
      id: "outstanding",
      header: t("outstanding"),
      align: "end",
      accessor: (row) => formatMoney(row.outstanding),
    },
  ];

  return (
    <div>
      {payables.data?.meta.totalOutstanding ? (
        <div className="mb-6">
          <StatCard label={t("totalOutstanding")} value={formatMoney(payables.data.meta.totalOutstanding)} />
        </div>
      ) : null}
      <DataTable
        caption={t("outstandingTab")}
        columns={columns}
        data={payables.data?.data ?? []}
        getRowId={(row) => row.supplierId}
        isLoading={payables.isLoading}
        error={payables.isError ? userFacingError(payables.error, tc("error"), tc("forbidden")) : undefined}
        onRetry={() => payables.refetch()}
        emptyTitle={t("empty")}
        emptyDescription={t("emptyDescription")}
        rowActions={
          canCreate
            ? (row) => (
                <Link
                  href={`/payments/new?supplierId=${row.supplierId}`}
                  className="text-sm font-semibold text-teal hover:underline"
                >
                  {t("recordPayment")}
                </Link>
              )
            : undefined
        }
      />
      {payables.data ? (
        <Pagination
          className="mt-4"
          page={payables.data.meta.page}
          pageSize={payables.data.meta.pageSize}
          totalItems={payables.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}

function AgingTab() {
  const t = useTranslations("payables");
  const tc = useTranslations("common");
  const [supplierId, setSupplierId] = React.useState("");
  const suppliers = useSuppliers({ page: 1, pageSize: 100 });
  const aging = usePayablesAging({ supplierId: supplierId || undefined });

  if (aging.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (aging.isError || !aging.data) {
    return (
      <ErrorState
        description={userFacingError(aging.error, tc("error"), tc("forbidden"))}
        onRetry={() => aging.refetch()}
      />
    );
  }

  const data: PayablesAging = aging.data;
  const rows = BUCKETS.map((key) => ({
    id: key,
    label: t(`bucket.${key}`),
    count: data.buckets[key].count,
    total: data.buckets[key].total,
  }));

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { id: "label", header: t("bucketLabel"), accessor: (row) => row.label },
    { id: "count", header: t("count"), align: "end", accessor: (row) => row.count },
    { id: "total", header: t("outstanding"), align: "end", accessor: (row) => formatMoney(row.total) },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <SelectField
          label={t("supplier")}
          wrapperClassName="w-56"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">{t("allSuppliers")}</option>
          {(suppliers.data?.data ?? []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="mb-6">
        <StatCard label={t("totalOutstanding")} value={formatMoney(data.totalOutstanding)} />
      </div>
      <DataTable
        caption={t("agingTab")}
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        emptyTitle={t("empty")}
        emptyDescription={t("emptyDescription")}
      />
    </div>
  );
}

export function PayablesPage() {
  const t = useTranslations("payables");
  const [tab, setTab] = React.useState("outstanding");

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("intro")}</p>

      <div className="mt-6">
        <Tabs
          label={t("title")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "outstanding", label: t("outstandingTab") },
            { value: "aging", label: t("agingTab") },
          ]}
        />
      </div>

      <TabPanel value="outstanding" activeValue={tab} className="mt-6">
        <OutstandingTab />
      </TabPanel>
      <TabPanel value="aging" activeValue={tab} className="mt-6">
        <AgingTab />
      </TabPanel>
    </div>
  );
}
