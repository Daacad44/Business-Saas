"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { NumberField, SelectField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { DateRangeBar, useReportDateRange } from "./date-range-bar";
import { ExportCsvButton } from "./export-button";
import { ChartSkeleton, QueryPanel, ReportSectionSkeleton } from "./query-panel";
import { BarChart } from "./svg-charts";
import {
  useExpiringBatches,
  useInventoryValuation,
  useLowStockReport,
  useReportWarehouses,
  useSlowMovingStock,
  useStockMovementSummary,
} from "../hooks";
import { REPORT_DEFAULT_LIMIT, REPORT_MAX_PAGE, REPORT_PAGE_SIZE_OPTIONS } from "../lib/constants";
import { toRangeQuery } from "../lib/dates";
import { reportUserFacingError } from "../lib/errors";
import type { ExpiringBatchRow, InventoryValuationWarehouseRow, LowStockRow, SlowMovingRow, StockMovementTypeRow } from "../types";

export function InventoryReportPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const err = (error: unknown) => reportUserFacingError(error, tc("error"), tc("forbidden"), t("validationError"));
  const { range, setRange, issue, isValid } = useReportDateRange();
  const query = toRangeQuery(range);
  const [tab, setTab] = React.useState("valuation");
  const [warehouseId, setWarehouseId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(REPORT_DEFAULT_LIMIT);
  const [expiryDays, setExpiryDays] = React.useState(30);
  const [slowDays, setSlowDays] = React.useState(30);

  React.useEffect(() => {
    setPage(1);
  }, [warehouseId, tab, limit, expiryDays, slowDays, range.startDate, range.endDate]);

  const warehouses = useReportWarehouses();
  const valuation = useInventoryValuation({
    page,
    limit,
    warehouseId: warehouseId || undefined,
  });
  const movements = useStockMovementSummary({ ...query, warehouseId: warehouseId || undefined }, isValid && tab === "movements");
  const lowStock = useLowStockReport({ page, limit, warehouseId: warehouseId || undefined });
  const expiring = useExpiringBatches({
    page,
    limit,
    warehouseId: warehouseId || undefined,
    days: expiryDays,
  });
  const slowMoving = useSlowMovingStock({
    page,
    limit,
    warehouseId: warehouseId || undefined,
    days: slowDays,
  });

  const warehouseColumns: DataTableColumn<InventoryValuationWarehouseRow>[] = [
    { id: "warehouse", header: t("warehouse"), accessor: (row) => row.warehouseName },
    { id: "qty", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "valuation", header: t("valuation"), align: "end", accessor: (row) => formatMoney(row.valuation) },
  ];
  const movementColumns: DataTableColumn<StockMovementTypeRow>[] = [
    { id: "type", header: t("movementType"), accessor: (row) => t(`movement.${row.type}`) },
    { id: "qty", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "count", header: t("movementCount"), align: "end", accessor: (row) => row.movementCount },
  ];
  const lowStockColumns: DataTableColumn<LowStockRow>[] = [
    { id: "product", header: t("product"), accessor: (row) => row.productName },
    { id: "variant", header: t("variant"), accessor: (row) => row.variantName ?? "—" },
    { id: "warehouse", header: t("warehouse"), accessor: (row) => row.warehouseName },
    { id: "qty", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "threshold", header: t("threshold"), align: "end", accessor: (row) => formatQuantity(row.threshold) },
    {
      id: "status",
      header: t("status"),
      align: "center",
      accessor: (row) => (
        <Badge variant={row.status === "OUT_OF_STOCK" ? "danger" : "warning"}>
          {row.status === "OUT_OF_STOCK" ? t("outOfStock") : t("lowStock")}
        </Badge>
      ),
    },
  ];
  const expiringColumns: DataTableColumn<ExpiringBatchRow>[] = [
    { id: "batch", header: t("batchNumber"), accessor: (row) => (
      <span className={row.isExpired ? "font-semibold text-red-800" : undefined}>
        {row.isExpired ? `${t("expired")} · ` : null}
        {row.batchNumber}
      </span>
    ) },
    { id: "product", header: t("product"), accessor: (row) => row.productName },
    { id: "warehouse", header: t("warehouse"), accessor: (row) => row.warehouseName },
    { id: "qty", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "expiry", header: t("expiryDate"), accessor: (row) => (row.expiryDate ? formatDate(row.expiryDate) : "—") },
    {
      id: "status",
      header: t("status"),
      align: "center",
      accessor: (row) =>
        row.isExpired ? (
          <Badge variant="danger">{t("expired")}</Badge>
        ) : (
          <Badge variant="warning">{t("expiring")}</Badge>
        ),
    },
  ];
  const slowColumns: DataTableColumn<SlowMovingRow>[] = [
    { id: "product", header: t("product"), accessor: (row) => row.productName },
    { id: "variant", header: t("variant"), accessor: (row) => row.variantName ?? "—" },
    { id: "warehouse", header: t("warehouse"), accessor: (row) => row.warehouseName },
    { id: "qty", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "days", header: t("daysWithoutSale"), align: "end", accessor: (row) => row.daysWithoutSale },
  ];

  return (
    <div>
      <h1 className="font-display text-4xl">{t("inventoryTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("inventoryIntro")}</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SelectField
          label={t("warehouse")}
          wrapperClassName="w-56"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
        >
          <option value="">{t("allWarehouses")}</option>
          {(warehouses.data ?? []).map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mt-6">
        <Tabs
          label={t("inventoryTitle")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "valuation", label: t("valuation") },
            { value: "movements", label: t("movements") },
            { value: "low-stock", label: t("lowStock") },
            { value: "expiring", label: t("expiringBatches") },
            { value: "slow", label: t("slowMoving") },
          ]}
        />
      </div>

      <TabPanel value="valuation" activeValue={tab} className="mt-6">
        <QueryPanel
          isLoading={valuation.isLoading}
          isError={valuation.isError}
          error={valuation.isError ? err(valuation.error) : undefined}
          onRetry={() => valuation.refetch()}
          skeleton={<ReportSectionSkeleton cards={2} />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label={t("totalValuation")} value={formatMoney(valuation.data?.data.totalValuation ?? "0.00")} />
            <StatCard label={t("totalQuantity")} value={formatQuantity(valuation.data?.data.totalQuantity ?? "0.000")} />
          </div>
        </QueryPanel>
        <div className="mt-4 mb-3 flex justify-end">
          <ExportCsvButton
            filename="inventory-valuation.csv"
            headers={["warehouseId", "warehouseName", "quantity", "valuation"]}
            rows={(valuation.data?.data.byWarehouse ?? []).map((row) => [
              row.warehouseId,
              row.warehouseName,
              row.quantity,
              row.valuation,
            ])}
            disabled={valuation.isLoading || valuation.isError}
          />
        </div>
        <DataTable
          caption={t("valuationByWarehouse")}
          columns={warehouseColumns}
          data={valuation.data?.data.byWarehouse ?? []}
          getRowId={(row) => row.warehouseId}
          isLoading={valuation.isLoading}
          error={valuation.isError ? err(valuation.error) : undefined}
          onRetry={() => valuation.refetch()}
          emptyTitle={t("emptyInventory")}
          emptyDescription={t("emptyInventoryDescription")}
        />
        {valuation.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(valuation.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={valuation.data.meta.limit}
            totalItems={valuation.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="movements" activeValue={tab} className="mt-6">
        <DateRangeBar range={range} onRangeChange={setRange} issue={issue} />
        {issue ? (
          <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {issue === "tooLong" ? t("rangeTooLong") : t("rangeInverted")}
          </p>
        ) : null}
        <div className="mt-4">
          <QueryPanel
            isLoading={movements.isLoading}
            isError={movements.isError}
            error={movements.isError ? err(movements.error) : undefined}
            onRetry={() => movements.refetch()}
            isEmpty={!movements.isLoading && !movements.isError && (movements.data?.byType.length ?? 0) === 0}
            emptyTitle={t("emptyMovements")}
            skeleton={<ChartSkeleton />}
          >
            <BarChart
              ariaLabel={t("movements")}
              valueHeader={t("quantity")}
              emptyLabel={t("emptyMovements")}
              data={(movements.data?.byType ?? []).map((row, index) => ({
                id: row.type,
                label: t(`movement.${row.type}`),
                value: row.quantity,
                formatted: formatQuantity(row.quantity),
                pattern: (["solid", "stripes", "dots", "hatch", "dashes"] as const)[index % 5],
              }))}
            />
          </QueryPanel>
        </div>
        <div className="mt-4">
          <DataTable
            caption={t("movements")}
            columns={movementColumns}
            data={movements.data?.byType ?? []}
            getRowId={(row) => row.type}
            isLoading={movements.isLoading}
            error={movements.isError ? err(movements.error) : undefined}
            onRetry={() => movements.refetch()}
            emptyTitle={t("emptyMovements")}
          />
        </div>
      </TabPanel>

      <TabPanel value="low-stock" activeValue={tab} className="mt-6">
        <div className="mb-3 flex justify-end">
          <ExportCsvButton
            filename="low-stock.csv"
            headers={["stockLevelId", "warehouseName", "productName", "variantName", "quantity", "threshold", "status"]}
            rows={(lowStock.data?.data ?? []).map((row) => [
              row.stockLevelId,
              row.warehouseName,
              row.productName,
              row.variantName ?? "",
              row.quantity,
              row.threshold,
              row.status,
            ])}
            disabled={lowStock.isLoading || lowStock.isError}
          />
        </div>
        <DataTable
          caption={t("lowStock")}
          columns={lowStockColumns}
          data={lowStock.data?.data ?? []}
          getRowId={(row) => row.stockLevelId}
          isLoading={lowStock.isLoading}
          error={lowStock.isError ? err(lowStock.error) : undefined}
          onRetry={() => lowStock.refetch()}
          emptyTitle={t("emptyLowStock")}
        />
        {lowStock.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(lowStock.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={lowStock.data.meta.limit}
            totalItems={lowStock.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="expiring" activeValue={tab} className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <NumberField
            kind="integer"
            label={t("expiryHorizon")}
            wrapperClassName="w-40"
            min={0}
            max={730}
            value={expiryDays}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next >= 0 && next <= 730) setExpiryDays(next);
            }}
          />
          <ExportCsvButton
            filename="expiring-batches.csv"
            headers={["batchId", "batchNumber", "warehouseName", "productName", "quantity", "expiryDate", "isExpired"]}
            rows={(expiring.data?.data ?? []).map((row) => [
              row.batchId,
              row.batchNumber,
              row.warehouseName,
              row.productName,
              row.quantity,
              row.expiryDate ?? "",
              row.isExpired ? "true" : "false",
            ])}
            disabled={expiring.isLoading || expiring.isError}
          />
        </div>
        <DataTable
          caption={t("expiringBatches")}
          columns={expiringColumns}
          data={expiring.data?.data ?? []}
          getRowId={(row) => row.batchId}
          isLoading={expiring.isLoading}
          error={expiring.isError ? err(expiring.error) : undefined}
          onRetry={() => expiring.refetch()}
          emptyTitle={t("emptyExpiring")}
        />
        {expiring.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(expiring.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={expiring.data.meta.limit}
            totalItems={expiring.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>

      <TabPanel value="slow" activeValue={tab} className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <NumberField
            kind="integer"
            label={t("slowMovingDays")}
            wrapperClassName="w-40"
            min={1}
            max={365}
            value={slowDays}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next >= 1 && next <= 365) setSlowDays(next);
            }}
          />
          <ExportCsvButton
            filename="slow-moving.csv"
            headers={["stockLevelId", "warehouseName", "productName", "variantName", "quantity", "daysWithoutSale"]}
            rows={(slowMoving.data?.data ?? []).map((row) => [
              row.stockLevelId,
              row.warehouseName,
              row.productName,
              row.variantName ?? "",
              row.quantity,
              String(row.daysWithoutSale),
            ])}
            disabled={slowMoving.isLoading || slowMoving.isError}
          />
        </div>
        <DataTable
          caption={t("slowMoving")}
          columns={slowColumns}
          data={slowMoving.data?.data ?? []}
          getRowId={(row) => row.stockLevelId}
          isLoading={slowMoving.isLoading}
          error={slowMoving.isError ? err(slowMoving.error) : undefined}
          onRetry={() => slowMoving.refetch()}
          emptyTitle={t("emptySlowMoving")}
        />
        {slowMoving.data ? (
          <Pagination
            className="mt-4"
            page={Math.min(slowMoving.data.meta.page, REPORT_MAX_PAGE)}
            pageSize={slowMoving.data.meta.limit}
            totalItems={slowMoving.data.meta.total}
            onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
            onPageSizeChange={setLimit}
            pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
          />
        ) : null}
      </TabPanel>
    </div>
  );
}
