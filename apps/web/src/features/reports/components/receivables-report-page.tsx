"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";
import { DateRangeBar, useReportDateRange } from "./date-range-bar";
import { ExportCsvButton } from "./export-button";
import { ChartSkeleton, QueryPanel, ReportSectionSkeleton } from "./query-panel";
import { BarChart, patternForIndex } from "./svg-charts";
import { useCollectionsSummary, useReceivablesAging } from "../hooks";
import { REPORT_DEFAULT_LIMIT, REPORT_MAX_PAGE, REPORT_PAGE_SIZE_OPTIONS } from "../lib/constants";
import { toRangeQuery } from "../lib/dates";
import { reportUserFacingError } from "../lib/errors";
import type { AgingBucketKey, AgingByCustomerRow, CollectionsByMethodRow } from "../types";

const BUCKET_VARIANT: Record<AgingBucketKey, "success" | "info" | "warning" | "copper" | "danger"> = {
  current: "success",
  "1-30": "info",
  "31-60": "warning",
  "61-90": "copper",
  "90+": "danger",
};

export function ReceivablesReportPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const err = (error: unknown) => reportUserFacingError(error, tc("error"), tc("forbidden"), t("validationError"));
  const { range, setRange, issue, isValid } = useReportDateRange();
  const query = toRangeQuery(range);
  const [tab, setTab] = React.useState("aging");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(REPORT_DEFAULT_LIMIT);

  React.useEffect(() => {
    setPage(1);
  }, [limit]);

  const aging = useReceivablesAging({ page, limit });
  const collections = useCollectionsSummary(query, isValid && tab === "collections");

  const bucketLabel = (key: AgingBucketKey) => t(`bucket.${key}`);

  const customerColumns: DataTableColumn<AgingByCustomerRow>[] = [
    {
      id: "customer",
      header: t("customer"),
      accessor: (row) => (
        <Link href={`/customers/${row.customerId}`} className="font-semibold text-ink hover:underline">
          {row.customerName}
        </Link>
      ),
    },
    { id: "phone", header: t("phone"), accessor: (row) => row.customerPhone ?? "—" },
    { id: "outstanding", header: t("outstanding"), align: "end", accessor: (row) => formatMoney(row.outstanding) },
    { id: "debts", header: t("debtCount"), align: "end", accessor: (row) => row.debtCount },
    {
      id: "bucket",
      header: t("agingBucket"),
      align: "center",
      accessor: (row) => <Badge variant={BUCKET_VARIANT[row.bucket]}>{bucketLabel(row.bucket)}</Badge>,
    },
  ];
  const collectionColumns: DataTableColumn<CollectionsByMethodRow>[] = [
    { id: "method", header: t("paymentMethod"), accessor: (row) => t(`payment.${row.method}`) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "count", header: t("paymentCount"), align: "end", accessor: (row) => row.paymentCount },
  ];

  return (
    <div>
      <h1 className="font-display text-4xl">{t("receivablesTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("receivablesIntro")}</p>

      <div className="mt-6">
        <Tabs
          label={t("receivablesTitle")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "aging", label: t("aging") },
            { value: "collections", label: t("collections") },
          ]}
        />
      </div>

      <TabPanel value="aging" activeValue={tab} className="mt-6">
        <QueryPanel
          isLoading={aging.isLoading}
          isError={aging.isError}
          error={aging.isError ? err(aging.error) : undefined}
          onRetry={() => aging.refetch()}
          skeleton={<ReportSectionSkeleton cards={6} />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={t("totalOutstanding")} value={formatMoney(aging.data?.data.totalOutstanding ?? "0.00")} />
            {(aging.data?.data.buckets ?? []).map((bucket) => (
              <StatCard
                key={bucket.bucket}
                label={bucketLabel(bucket.bucket)}
                value={formatMoney(bucket.outstanding)}
              />
            ))}
          </div>
        </QueryPanel>

        <div className="mt-6">
          <QueryPanel
            isLoading={aging.isLoading}
            isError={aging.isError}
            error={aging.isError ? err(aging.error) : undefined}
            onRetry={() => aging.refetch()}
            skeleton={<ChartSkeleton />}
          >
            <BarChart
              ariaLabel={t("aging")}
              valueHeader={t("outstanding")}
              emptyLabel={t("emptyReceivables")}
              data={(aging.data?.data.buckets ?? []).map((bucket, index) => ({
                id: bucket.bucket,
                label: bucketLabel(bucket.bucket),
                value: bucket.outstanding,
                formatted: `${formatMoney(bucket.outstanding)} · ${bucket.debtCount}`,
                pattern: patternForIndex(index),
              }))}
            />
          </QueryPanel>
        </div>

        <div className="mt-6 flex justify-end">
          <ExportCsvButton
            filename="receivables-by-customer.csv"
            headers={["customerId", "customerName", "customerPhone", "outstanding", "debtCount", "bucket"]}
            rows={(aging.data?.data.byCustomer ?? []).map((row) => [
              row.customerId,
              row.customerName,
              row.customerPhone ?? "",
              row.outstanding,
              String(row.debtCount),
              row.bucket,
            ])}
            disabled={aging.isLoading || aging.isError}
          />
        </div>
        <DataTable
          caption={t("byCustomer")}
          columns={customerColumns}
          data={aging.data?.data.byCustomer ?? []}
          getRowId={(row) => row.customerId}
          isLoading={aging.isLoading}
          error={aging.isError ? err(aging.error) : undefined}
          onRetry={() => aging.refetch()}
          emptyTitle={t("emptyReceivables")}
          emptyDescription={t("emptyReceivablesDescription")}
        />
        {aging.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(aging.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={aging.data.meta.limit}
            totalItems={aging.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="collections" activeValue={tab} className="mt-6">
        <DateRangeBar range={range} onRangeChange={setRange} issue={issue} />
        {issue ? (
          <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {issue === "tooLong" ? t("rangeTooLong") : t("rangeInverted")}
          </p>
        ) : null}
        <div className="mt-4">
          <QueryPanel
            isLoading={collections.isLoading}
            isError={collections.isError}
            error={collections.isError ? err(collections.error) : undefined}
            onRetry={() => collections.refetch()}
            skeleton={<ReportSectionSkeleton cards={2} />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label={t("totalCollected")} value={formatMoney(collections.data?.totalCollected ?? "0.00")} />
              <StatCard label={t("paymentCount")} value={collections.data?.paymentCount ?? 0} />
            </div>
          </QueryPanel>
        </div>
        <div className="mt-4">
          <QueryPanel
            isLoading={collections.isLoading}
            isError={collections.isError}
            error={collections.isError ? err(collections.error) : undefined}
            onRetry={() => collections.refetch()}
            isEmpty={!collections.isLoading && !collections.isError && (collections.data?.byMethod.length ?? 0) === 0}
            emptyTitle={t("emptyCollections")}
            skeleton={<ChartSkeleton />}
          >
            <BarChart
              ariaLabel={t("collections")}
              valueHeader={t("amount")}
              emptyLabel={t("emptyCollections")}
              data={(collections.data?.byMethod ?? []).map((row, index) => ({
                id: row.method,
                label: t(`payment.${row.method}`),
                value: row.amount,
                formatted: formatMoney(row.amount),
                pattern: patternForIndex(index),
              }))}
            />
          </QueryPanel>
        </div>
        <div className="mt-4 flex justify-end">
          <ExportCsvButton
            filename="collections-by-method.csv"
            headers={["method", "amount", "paymentCount"]}
            rows={(collections.data?.byMethod ?? []).map((row) => [row.method, row.amount, String(row.paymentCount)])}
            disabled={collections.isLoading || collections.isError}
          />
        </div>
        <DataTable
          caption={t("collections")}
          columns={collectionColumns}
          data={collections.data?.byMethod ?? []}
          getRowId={(row) => row.method}
          isLoading={collections.isLoading}
          error={collections.isError ? err(collections.error) : undefined}
          onRetry={() => collections.refetch()}
          emptyTitle={t("emptyCollections")}
        />
      </TabPanel>
    </div>
  );
}
