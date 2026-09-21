"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SelectField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { DateRangeBar, LimitSelect, useReportDateRange, useReportPaging } from "./date-range-bar";
import { ExportCsvButton } from "./export-button";
import { ChartSkeleton, QueryPanel, ReportSectionSkeleton } from "./query-panel";
import { BarChart, LineChart } from "./svg-charts";
import {
  useSalesByBranch,
  useSalesByCustomer,
  useSalesByPaymentMethod,
  useSalesByProduct,
  useSalesReport,
  useTopProducts,
} from "../hooks";
import { REPORT_DEFAULT_TOP_N, REPORT_MAX_PAGE, REPORT_PAGE_SIZE_OPTIONS, REPORT_TOP_N_OPTIONS } from "../lib/constants";
import { toRangeQuery } from "../lib/dates";
import { reportUserFacingError } from "../lib/errors";
import type {
  SalesByBranchRow,
  SalesByCustomerRow,
  SalesByPaymentMethodRow,
  SalesByProductRow,
  TopProductRow,
} from "../types";

function useReportError() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  return (error: unknown) => reportUserFacingError(error, tc("error"), tc("forbidden"), t("validationError"));
}

export function SalesReportPage() {
  const t = useTranslations("reports");
  const err = useReportError();
  const { range, setRange: setRangeState, groupBy, setGroupBy: setGroupByState, issue, isValid } = useReportDateRange();
  const query = toRangeQuery(range);
  const [tab, setTabState] = React.useState("branch");
  const { page, setPage, limit, setLimit } = useReportPaging();
  const [topN, setTopN] = React.useState(REPORT_DEFAULT_TOP_N);
  const [topSort, setTopSort] = React.useState<"revenue" | "quantity">("revenue");

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

  const sales = useSalesReport({ ...query, groupBy }, isValid);
  const byBranch = useSalesByBranch({ ...query, page, limit }, isValid && tab === "branch");
  const byCustomer = useSalesByCustomer({ ...query, page, limit }, isValid && tab === "customer");
  const byProduct = useSalesByProduct({ ...query, page, limit }, isValid && tab === "product");
  const byMethod = useSalesByPaymentMethod(query, isValid && tab === "method");
  const topProducts = useTopProducts({ ...query, sortBy: topSort, limit: topN }, isValid && tab === "top");

  const branchColumns: DataTableColumn<SalesByBranchRow>[] = [
    { id: "branch", header: t("branch"), accessor: (row) => row.branchName ?? row.branchCode ?? row.branchId },
    { id: "revenue", header: t("revenue"), align: "end", accessor: (row) => formatMoney(row.revenue) },
    { id: "count", header: t("transactions"), align: "end", accessor: (row) => row.transactionCount },
  ];
  const customerColumns: DataTableColumn<SalesByCustomerRow>[] = [
    { id: "customer", header: t("customer"), accessor: (row) => row.customerName ?? t("walkIn") },
    { id: "phone", header: t("phone"), accessor: (row) => row.customerPhone ?? "—" },
    { id: "revenue", header: t("revenue"), align: "end", accessor: (row) => formatMoney(row.revenue) },
    { id: "count", header: t("transactions"), align: "end", accessor: (row) => row.transactionCount },
  ];
  const productColumns: DataTableColumn<SalesByProductRow>[] = [
    { id: "product", header: t("product"), accessor: (row) => row.productName ?? row.productId },
    { id: "sku", header: t("sku"), accessor: (row) => row.productSku ?? "—" },
    { id: "qty", header: t("quantitySold"), align: "end", accessor: (row) => formatQuantity(row.quantitySold) },
    { id: "revenue", header: t("revenue"), align: "end", accessor: (row) => formatMoney(row.revenue) },
  ];
  const methodColumns: DataTableColumn<SalesByPaymentMethodRow>[] = [
    { id: "method", header: t("paymentMethod"), accessor: (row) => t(`payment.${row.method}`) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "count", header: t("transactions"), align: "end", accessor: (row) => row.transactionCount },
    { id: "avg", header: t("averageAmount"), align: "end", accessor: (row) => formatMoney(row.averageAmount) },
  ];
  const topColumns: DataTableColumn<TopProductRow>[] = [
    { id: "product", header: t("product"), accessor: (row) => row.productName ?? row.productId },
    { id: "sku", header: t("sku"), accessor: (row) => row.productSku ?? "—" },
    { id: "qty", header: t("quantitySold"), align: "end", accessor: (row) => formatQuantity(row.quantitySold) },
    { id: "revenue", header: t("revenue"), align: "end", accessor: (row) => formatMoney(row.revenue) },
  ];

  const rangeBanner = issue ? (
    <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {issue === "tooLong" ? t("rangeTooLong") : t("rangeInverted")}
    </p>
  ) : null;

  return (
    <div>
      <h1 className="font-display text-4xl">{t("salesTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("salesIntro")}</p>

      <div className="mt-6">
        <DateRangeBar range={range} onRangeChange={setRange} groupBy={groupBy} onGroupByChange={setGroupBy} issue={issue} />
        {rangeBanner}
      </div>

      <div className="mt-6">
        <QueryPanel
          isLoading={sales.isLoading}
          isError={sales.isError}
          error={sales.isError ? err(sales.error) : undefined}
          onRetry={() => sales.refetch()}
          skeleton={<ReportSectionSkeleton cards={5} />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={t("revenue")} value={formatMoney(sales.data?.totals.revenue ?? "0.00")} />
            <StatCard label={t("transactions")} value={sales.data?.totals.transactionCount ?? 0} />
            <StatCard label={t("averageBasket")} value={formatMoney(sales.data?.totals.averageBasketValue ?? "0.00")} />
            <StatCard label={t("discount")} value={formatMoney(sales.data?.totals.discount ?? "0.00")} />
            <StatCard label={t("tax")} value={formatMoney(sales.data?.totals.tax ?? "0.00")} />
          </div>
        </QueryPanel>
      </div>

      <section className="mt-8" aria-labelledby="sales-series">
        <h2 id="sales-series" className="font-display text-2xl">
          {t("revenueOverTime")}
        </h2>
        <div className="mt-4">
          <QueryPanel
            isLoading={sales.isLoading}
            isError={sales.isError}
            error={sales.isError ? err(sales.error) : undefined}
            onRetry={() => sales.refetch()}
            isEmpty={!sales.isLoading && !sales.isError && (sales.data?.breakdown.length ?? 0) === 0}
            emptyTitle={t("emptySales")}
            emptyDescription={t("emptySalesDescription")}
            skeleton={<ChartSkeleton />}
          >
            <LineChart
              ariaLabel={t("revenueOverTime")}
              valueHeader={t("revenue")}
              emptyLabel={t("emptySales")}
              data={(sales.data?.breakdown ?? []).map((bucket) => ({
                id: bucket.period,
                label: formatDate(bucket.period),
                value: bucket.revenue,
                formatted: formatMoney(bucket.revenue),
              }))}
            />
          </QueryPanel>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <Tabs
          label={t("salesBreakdown")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "branch", label: t("byBranch") },
            { value: "customer", label: t("byCustomer") },
            { value: "product", label: t("byProduct") },
            { value: "method", label: t("byPaymentMethod") },
            { value: "top", label: t("topProducts") },
          ]}
        />
      </div>

      <TabPanel value="branch" activeValue={tab} className="mt-6">
        <div className="mb-3 flex justify-end">
          <ExportCsvButton
            filename="sales-by-branch.csv"
            headers={["branchId", "branchName", "branchCode", "revenue", "transactionCount"]}
            rows={(byBranch.data?.data ?? []).map((row) => [
              row.branchId,
              row.branchName ?? "",
              row.branchCode ?? "",
              row.revenue,
              String(row.transactionCount),
            ])}
            disabled={byBranch.isLoading || byBranch.isError}
          />
        </div>
        <DataTable
          caption={t("byBranch")}
          columns={branchColumns}
          data={byBranch.data?.data ?? []}
          getRowId={(row) => row.branchId}
          isLoading={byBranch.isLoading}
          error={byBranch.isError ? err(byBranch.error) : undefined}
          onRetry={() => byBranch.refetch()}
          emptyTitle={t("emptySales")}
        />
        {byBranch.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(byBranch.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={byBranch.data.meta.limit}
            totalItems={byBranch.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="customer" activeValue={tab} className="mt-6">
        <div className="mb-3 flex justify-end">
          <ExportCsvButton
            filename="sales-by-customer.csv"
            headers={["customerId", "customerName", "customerPhone", "revenue", "transactionCount"]}
            rows={(byCustomer.data?.data ?? []).map((row) => [
              row.customerId ?? "",
              row.customerName ?? "",
              row.customerPhone ?? "",
              row.revenue,
              String(row.transactionCount),
            ])}
            disabled={byCustomer.isLoading || byCustomer.isError}
          />
        </div>
        <DataTable
          caption={t("byCustomer")}
          columns={customerColumns}
          data={byCustomer.data?.data ?? []}
          getRowId={(row) => row.customerId ?? `walk-in-${row.revenue}`}
          isLoading={byCustomer.isLoading}
          error={byCustomer.isError ? err(byCustomer.error) : undefined}
          onRetry={() => byCustomer.refetch()}
          emptyTitle={t("emptySales")}
        />
        {byCustomer.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(byCustomer.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={byCustomer.data.meta.limit}
            totalItems={byCustomer.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="product" activeValue={tab} className="mt-6">
        <div className="mb-3 flex justify-end">
          <ExportCsvButton
            filename="sales-by-product.csv"
            headers={["productId", "productName", "productSku", "quantitySold", "revenue", "lineItemCount"]}
            rows={(byProduct.data?.data ?? []).map((row) => [
              row.productId,
              row.productName ?? "",
              row.productSku ?? "",
              row.quantitySold,
              row.revenue,
              String(row.lineItemCount),
            ])}
            disabled={byProduct.isLoading || byProduct.isError}
          />
        </div>
        <DataTable
          caption={t("byProduct")}
          columns={productColumns}
          data={byProduct.data?.data ?? []}
          getRowId={(row) => row.productId}
          isLoading={byProduct.isLoading}
          error={byProduct.isError ? err(byProduct.error) : undefined}
          onRetry={() => byProduct.refetch()}
          emptyTitle={t("emptySales")}
        />
        {byProduct.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(byProduct.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={byProduct.data.meta.limit}
            totalItems={byProduct.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="method" activeValue={tab} className="mt-6">
        <div className="mb-3 flex justify-end">
          <ExportCsvButton
            filename="sales-by-payment-method.csv"
            headers={["method", "amount", "transactionCount", "averageAmount"]}
            rows={(byMethod.data?.data ?? []).map((row) => [
              row.method,
              row.amount,
              String(row.transactionCount),
              row.averageAmount,
            ])}
            disabled={byMethod.isLoading || byMethod.isError}
          />
        </div>
        <QueryPanel
          isLoading={byMethod.isLoading}
          isError={byMethod.isError}
          error={byMethod.isError ? err(byMethod.error) : undefined}
          onRetry={() => byMethod.refetch()}
          isEmpty={!byMethod.isLoading && !byMethod.isError && (byMethod.data?.data.length ?? 0) === 0}
          emptyTitle={t("emptySales")}
          skeleton={<ChartSkeleton />}
        >
          <BarChart
            ariaLabel={t("byPaymentMethod")}
            valueHeader={t("amount")}
            emptyLabel={t("emptySales")}
            data={(byMethod.data?.data ?? []).map((row, index) => ({
              id: row.method,
              label: t(`payment.${row.method}`),
              value: row.amount,
              formatted: formatMoney(row.amount),
              pattern: (["solid", "stripes", "dots", "hatch", "dashes"] as const)[index % 5],
            }))}
          />
        </QueryPanel>
        <div className="mt-4">
          <DataTable
            caption={t("byPaymentMethod")}
            columns={methodColumns}
            data={byMethod.data?.data ?? []}
            getRowId={(row) => row.method}
            isLoading={byMethod.isLoading}
            error={byMethod.isError ? err(byMethod.error) : undefined}
            onRetry={() => byMethod.refetch()}
            emptyTitle={t("emptySales")}
          />
        </div>
      </TabPanel>

      <TabPanel value="top" activeValue={tab} className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <SelectField
              label={t("sortBy")}
              wrapperClassName="w-44"
              value={topSort}
              onChange={(event) => setTopSort(event.target.value === "quantity" ? "quantity" : "revenue")}
            >
              <option value="revenue">{t("revenue")}</option>
              <option value="quantity">{t("quantitySold")}</option>
            </SelectField>
            <LimitSelect value={topN} onChange={setTopN} options={REPORT_TOP_N_OPTIONS} label={t("topN")} />
          </div>
          <ExportCsvButton
            filename="top-products.csv"
            headers={["productId", "productName", "productSku", "quantitySold", "revenue"]}
            rows={(topProducts.data ?? []).map((row) => [
              row.productId,
              row.productName ?? "",
              row.productSku ?? "",
              row.quantitySold,
              row.revenue,
            ])}
            disabled={topProducts.isLoading || topProducts.isError}
          />
        </div>
        <DataTable
          caption={t("topProducts")}
          columns={topColumns}
          data={topProducts.data ?? []}
          getRowId={(row) => row.productId}
          isLoading={topProducts.isLoading}
          error={topProducts.isError ? err(topProducts.error) : undefined}
          onRetry={() => topProducts.refetch()}
          emptyTitle={t("emptySales")}
        />
      </TabPanel>
    </div>
  );
}
