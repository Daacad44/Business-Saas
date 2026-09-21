"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatDate, formatMoney } from "@/lib/format";
import { DateRangeBar, useReportDateRange, useReportPaging } from "./date-range-bar";
import { ExportCsvButton } from "./export-button";
import { ChartSkeleton, QueryPanel, ReportSectionSkeleton } from "./query-panel";
import { BarChart, LineChart, patternForIndex } from "./svg-charts";
import { useExpensesReport, usePurchasesReport } from "../hooks";
import { REPORT_MAX_PAGE, REPORT_PAGE_SIZE_OPTIONS } from "../lib/constants";
import { toRangeQuery } from "../lib/dates";
import { reportUserFacingError } from "../lib/errors";
import type { ExpensesByCategoryRow, PurchasesBySupplierRow } from "../types";

export function PurchasesReportPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const err = (error: unknown) => reportUserFacingError(error, tc("error"), tc("forbidden"), t("validationError"));
  const { range, setRange: setRangeState, groupBy, setGroupBy: setGroupByState, issue, isValid } = useReportDateRange();
  const query = toRangeQuery(range);
  const [tab, setTabState] = React.useState("purchases");
  const { page, setPage, limit, setLimit } = useReportPaging();

  function setRange(next: typeof range) {
    setPage(1);
    setRangeState(next);
  }
  function setGroupBy(next: typeof groupBy) {
    setPage(1);
    setGroupByState(next);
  }
  function setTab(next: string) {
    setPage(1);
    setTabState(next);
  }

  const purchases = usePurchasesReport({ ...query, groupBy, page, limit }, isValid);
  const expenses = useExpensesReport({ ...query, page, limit }, isValid && tab === "expenses");

  const supplierColumns: DataTableColumn<PurchasesBySupplierRow>[] = [
    { id: "supplier", header: t("supplier"), accessor: (row) => row.supplierName ?? row.supplierId },
    { id: "spend", header: t("totalSpend"), align: "end", accessor: (row) => formatMoney(row.totalSpend) },
    { id: "count", header: t("purchaseCount"), align: "end", accessor: (row) => row.purchaseCount },
  ];
  const categoryColumns: DataTableColumn<ExpensesByCategoryRow>[] = [
    { id: "category", header: t("category"), accessor: (row) => row.categoryName ?? row.categoryId },
    { id: "spend", header: t("totalSpend"), align: "end", accessor: (row) => formatMoney(row.totalSpend) },
    { id: "count", header: t("expenseCount"), align: "end", accessor: (row) => row.expenseCount },
  ];

  return (
    <div>
      <h1 className="font-display text-4xl">{t("purchasesTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("purchasesIntro")}</p>

      <div className="mt-6">
        <DateRangeBar
          range={range}
          onRangeChange={setRange}
          groupBy={tab === "purchases" ? groupBy : undefined}
          onGroupByChange={tab === "purchases" ? setGroupBy : undefined}
          issue={issue}
        />
        {issue ? (
          <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {issue === "tooLong" ? t("rangeTooLong") : t("rangeInverted")}
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <Tabs
          label={t("purchasesTitle")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "purchases", label: t("purchases") },
            { value: "expenses", label: t("expenses") },
          ]}
        />
      </div>

      <TabPanel value="purchases" activeValue={tab} className="mt-6">
        <QueryPanel
          isLoading={purchases.isLoading}
          isError={purchases.isError}
          error={purchases.isError ? err(purchases.error) : undefined}
          onRetry={() => purchases.refetch()}
          skeleton={<ReportSectionSkeleton cards={2} />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label={t("totalSpend")} value={formatMoney(purchases.data?.data.totals.totalSpend ?? "0.00")} />
            <StatCard label={t("purchaseCount")} value={purchases.data?.data.totals.purchaseCount ?? 0} />
          </div>
        </QueryPanel>

        <section className="mt-6" aria-labelledby="purchase-volume">
          <h2 id="purchase-volume" className="font-display text-2xl">
            {t("purchaseVolume")}
          </h2>
          <div className="mt-4">
            <QueryPanel
              isLoading={purchases.isLoading}
              isError={purchases.isError}
              error={purchases.isError ? err(purchases.error) : undefined}
              onRetry={() => purchases.refetch()}
              isEmpty={!purchases.isLoading && !purchases.isError && (purchases.data?.data.breakdown.length ?? 0) === 0}
              emptyTitle={t("emptyPurchases")}
              emptyDescription={t("emptyPurchasesDescription")}
              skeleton={<ChartSkeleton />}
            >
              <LineChart
                ariaLabel={t("purchaseVolume")}
                valueHeader={t("totalSpend")}
                emptyLabel={t("emptyPurchases")}
                data={(purchases.data?.data.breakdown ?? []).map((bucket) => ({
                  id: bucket.period,
                  label: formatDate(bucket.period),
                  value: bucket.totalSpend,
                  formatted: formatMoney(bucket.totalSpend),
                }))}
              />
            </QueryPanel>
          </div>
        </section>

        <div className="mt-6 flex justify-end">
          <ExportCsvButton
            filename="purchases-by-supplier.csv"
            headers={["supplierId", "supplierName", "totalSpend", "purchaseCount"]}
            rows={(purchases.data?.data.bySupplier ?? []).map((row) => [
              row.supplierId,
              row.supplierName ?? "",
              row.totalSpend,
              String(row.purchaseCount),
            ])}
            disabled={purchases.isLoading || purchases.isError}
          />
        </div>
        <DataTable
          caption={t("bySupplier")}
          columns={supplierColumns}
          data={purchases.data?.data.bySupplier ?? []}
          getRowId={(row) => row.supplierId}
          isLoading={purchases.isLoading}
          error={purchases.isError ? err(purchases.error) : undefined}
          onRetry={() => purchases.refetch()}
          emptyTitle={t("emptyPurchases")}
        />
        {purchases.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(purchases.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={purchases.data.meta.limit}
            totalItems={purchases.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="expenses" activeValue={tab} className="mt-6">
        <QueryPanel
          isLoading={expenses.isLoading}
          isError={expenses.isError}
          error={expenses.isError ? err(expenses.error) : undefined}
          onRetry={() => expenses.refetch()}
          skeleton={<ReportSectionSkeleton cards={2} />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label={t("totalSpend")} value={formatMoney(expenses.data?.data.totals.totalSpend ?? "0.00")} />
            <StatCard label={t("expenseCount")} value={expenses.data?.data.totals.expenseCount ?? 0} />
          </div>
        </QueryPanel>
        <div className="mt-4">
          <QueryPanel
            isLoading={expenses.isLoading}
            isError={expenses.isError}
            error={expenses.isError ? err(expenses.error) : undefined}
            onRetry={() => expenses.refetch()}
            isEmpty={!expenses.isLoading && !expenses.isError && (expenses.data?.data.byCategory.length ?? 0) === 0}
            emptyTitle={t("emptyExpenses")}
            skeleton={<ChartSkeleton />}
          >
            <BarChart
              ariaLabel={t("byCategory")}
              valueHeader={t("totalSpend")}
              emptyLabel={t("emptyExpenses")}
              data={(expenses.data?.data.byCategory ?? []).map((row, index) => ({
                id: row.categoryId,
                label: row.categoryName ?? row.categoryId,
                value: row.totalSpend,
                formatted: formatMoney(row.totalSpend),
                pattern: patternForIndex(index),
              }))}
            />
          </QueryPanel>
        </div>
        <div className="mt-4 flex justify-end">
          <ExportCsvButton
            filename="expenses-by-category.csv"
            headers={["categoryId", "categoryName", "totalSpend", "expenseCount"]}
            rows={(expenses.data?.data.byCategory ?? []).map((row) => [
              row.categoryId,
              row.categoryName ?? "",
              row.totalSpend,
              String(row.expenseCount),
            ])}
            disabled={expenses.isLoading || expenses.isError}
          />
        </div>
        <DataTable
          caption={t("byCategory")}
          columns={categoryColumns}
          data={expenses.data?.data.byCategory ?? []}
          getRowId={(row) => row.categoryId}
          isLoading={expenses.isLoading}
          error={expenses.isError ? err(expenses.error) : undefined}
          onRetry={() => expenses.refetch()}
          emptyTitle={t("emptyExpenses")}
        />
        {expenses.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(expenses.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={expenses.data.meta.limit}
            totalItems={expenses.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>
    </div>
  );
}
