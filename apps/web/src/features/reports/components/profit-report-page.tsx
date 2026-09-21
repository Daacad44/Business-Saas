"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { DateRangeBar, useReportDateRange, useReportPaging } from "./date-range-bar";
import { ExportCsvButton } from "./export-button";
import { ChartSkeleton, QueryPanel, ReportSectionSkeleton } from "./query-panel";
import { BarChart } from "./svg-charts";
import { useProfitByProduct, useProfitReport } from "../hooks";
import { REPORT_MAX_PAGE, REPORT_PAGE_SIZE_OPTIONS } from "../lib/constants";
import { toRangeQuery } from "../lib/dates";
import { reportUserFacingError } from "../lib/errors";
import type { ProfitByProductRow } from "../types";

function isNegativeMargin(percent: string): boolean {
  return percent.trim().startsWith("-");
}

export function ProfitReportPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const err = (error: unknown) => reportUserFacingError(error, tc("error"), tc("forbidden"), t("validationError"));
  const { range, setRange: setRangeState, groupBy, setGroupBy: setGroupByState, issue, isValid } = useReportDateRange();
  const query = toRangeQuery(range);
  const { page, setPage, limit, setLimit } = useReportPaging();

  function setRange(next: typeof range) {
    setPage(1);
    setRangeState(next);
  }
  function setGroupBy(next: typeof groupBy) {
    setPage(1);
    setGroupByState(next);
  }

  const profit = useProfitReport({ ...query, groupBy }, isValid);
  const byProduct = useProfitByProduct({ ...query, page, limit }, isValid);

  const columns: DataTableColumn<ProfitByProductRow>[] = [
    { id: "product", header: t("product"), accessor: (row) => row.productName },
    { id: "qty", header: t("quantitySold"), align: "end", accessor: (row) => formatQuantity(row.quantitySold) },
    { id: "revenue", header: t("revenue"), align: "end", accessor: (row) => formatMoney(row.revenue) },
    { id: "cogs", header: t("cogs"), align: "end", accessor: (row) => formatMoney(row.cost) },
    { id: "profit", header: t("grossProfit"), align: "end", accessor: (row) => formatMoney(row.grossProfit) },
    {
      id: "margin",
      header: t("margin"),
      align: "end",
      accessor: (row) => (
        <span className={isNegativeMargin(row.marginPercent) ? "font-semibold text-red-800" : undefined}>
          {formatPercent(row.marginPercent, { alreadyScaled: true, maximumFractionDigits: 2 })}
          {isNegativeMargin(row.marginPercent) ? (
            <Badge variant="danger" className="ml-2">
              {t("loss")}
            </Badge>
          ) : null}
        </span>
      ),
    },
  ];

  const totals = profit.data?.totals;
  const negativeTotal = Boolean(totals && (isNegativeMargin(totals.marginPercent) || totals.grossProfit.trim().startsWith("-")));

  return (
    <div>
      <h1 className="font-display text-4xl">{t("profitTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("profitIntro")}</p>

      <div className="mt-6">
        <DateRangeBar range={range} onRangeChange={setRange} groupBy={groupBy} onGroupByChange={setGroupBy} issue={issue} />
        {issue ? (
          <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {issue === "tooLong" ? t("rangeTooLong") : t("rangeInverted")}
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <QueryPanel
          isLoading={profit.isLoading}
          isError={profit.isError}
          error={profit.isError ? err(profit.error) : undefined}
          onRetry={() => profit.refetch()}
          skeleton={<ReportSectionSkeleton cards={4} />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("revenue")} value={formatMoney(totals?.revenue ?? "0.00")} />
            <StatCard label={t("cogs")} value={formatMoney(totals?.cost ?? "0.00")} />
            <StatCard
              label={t("grossProfit")}
              value={
                <span className={negativeTotal ? "text-red-800" : undefined}>
                  {formatMoney(totals?.grossProfit ?? "0.00")}
                  {negativeTotal ? <span className="ml-2 text-sm font-semibold">{t("loss")}</span> : null}
                </span>
              }
            />
            <StatCard
              label={t("margin")}
              value={
                <span className={totals && isNegativeMargin(totals.marginPercent) ? "text-red-800" : undefined}>
                  {formatPercent(totals?.marginPercent ?? "0.00", { alreadyScaled: true, maximumFractionDigits: 2 })}
                  {totals && isNegativeMargin(totals.marginPercent) ? (
                    <span className="ml-2 text-sm font-semibold">{t("loss")}</span>
                  ) : null}
                </span>
              }
            />
          </div>
        </QueryPanel>
      </div>

      <section className="mt-8" aria-labelledby="profit-series">
        <h2 id="profit-series" className="font-display text-2xl">
          {t("profitOverTime")}
        </h2>
        <div className="mt-4">
          <QueryPanel
            isLoading={profit.isLoading}
            isError={profit.isError}
            error={profit.isError ? err(profit.error) : undefined}
            onRetry={() => profit.refetch()}
            isEmpty={!profit.isLoading && !profit.isError && (profit.data?.breakdown.length ?? 0) === 0}
            emptyTitle={t("emptyProfit")}
            emptyDescription={t("emptyProfitDescription")}
            skeleton={<ChartSkeleton />}
          >
            <BarChart
              signed
              ariaLabel={t("profitOverTime")}
              valueHeader={t("grossProfit")}
              emptyLabel={t("emptyProfit")}
              data={(profit.data?.breakdown ?? []).map((bucket) => ({
                id: bucket.period,
                label: formatDate(bucket.period),
                value: bucket.grossProfit,
                formatted: `${formatMoney(bucket.grossProfit)} (${formatPercent(bucket.marginPercent, { alreadyScaled: true, maximumFractionDigits: 2 })})`,
              }))}
            />
          </QueryPanel>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="profit-by-product">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="profit-by-product" className="font-display text-2xl">
            {t("profitByProduct")}
          </h2>
          <ExportCsvButton
            filename="profit-by-product.csv"
            headers={["productId", "productName", "quantitySold", "revenue", "cost", "grossProfit", "marginPercent"]}
            rows={(byProduct.data?.data ?? []).map((row) => [
              row.productId,
              row.productName,
              row.quantitySold,
              row.revenue,
              row.cost,
              row.grossProfit,
              row.marginPercent,
            ])}
            disabled={byProduct.isLoading || byProduct.isError}
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption={t("profitByProduct")}
            columns={columns}
            data={byProduct.data?.data ?? []}
            getRowId={(row) => row.productId}
            isLoading={byProduct.isLoading}
            error={byProduct.isError ? err(byProduct.error) : undefined}
            onRetry={() => byProduct.refetch()}
            emptyTitle={t("emptyProfit")}
          />
        </div>
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
      </section>
    </div>
  );
}
