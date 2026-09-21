"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney } from "@/lib/format";
import { ExportCsvButton } from "./export-button";
import { QueryPanel, ReportSectionSkeleton } from "./query-panel";
import { usePayablesReport } from "../hooks";
import { REPORT_DEFAULT_LIMIT, REPORT_MAX_PAGE, REPORT_PAGE_SIZE_OPTIONS } from "../lib/constants";
import { reportUserFacingError } from "../lib/errors";
import type { PayableSupplierRow } from "../types";

export function PayablesReportPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const err = (error: unknown) => reportUserFacingError(error, tc("error"), tc("forbidden"), t("validationError"));
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(REPORT_DEFAULT_LIMIT);

  React.useEffect(() => {
    setPage(1);
  }, [limit]);

  const payables = usePayablesReport({ page, limit });

  const columns: DataTableColumn<PayableSupplierRow>[] = [
    { id: "supplier", header: t("supplier"), accessor: (row) => row.supplierName },
    { id: "phone", header: t("phone"), accessor: (row) => row.supplierPhone ?? "—" },
    {
      id: "balance",
      header: t("outstandingBalance"),
      align: "end",
      accessor: (row) => formatMoney(row.outstandingBalance),
    },
  ];

  return (
    <div>
      <h1 className="font-display text-4xl">{t("payablesTitle")}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("payablesIntro")}</p>

      <div className="mt-6">
        <QueryPanel
          isLoading={payables.isLoading}
          isError={payables.isError}
          error={payables.isError ? err(payables.error) : undefined}
          onRetry={() => payables.refetch()}
          skeleton={<ReportSectionSkeleton cards={1} />}
        >
          <StatCard label={t("totalPayable")} value={formatMoney(payables.data?.data.totalPayable ?? "0.00")} />
        </QueryPanel>
      </div>

      <div className="mt-6 flex justify-end">
        <ExportCsvButton
          filename="payables.csv"
          headers={["supplierId", "supplierName", "supplierPhone", "outstandingBalance"]}
          rows={(payables.data?.data.suppliers ?? []).map((row) => [
            row.supplierId,
            row.supplierName,
            row.supplierPhone ?? "",
            row.outstandingBalance,
          ])}
          disabled={payables.isLoading || payables.isError}
        />
      </div>
      <DataTable
        caption={t("payablesTitle")}
        columns={columns}
        data={payables.data?.data.suppliers ?? []}
        getRowId={(row) => row.supplierId}
        isLoading={payables.isLoading}
        error={payables.isError ? err(payables.error) : undefined}
        onRetry={() => payables.refetch()}
        emptyTitle={t("emptyPayables")}
        emptyDescription={t("emptyPayablesDescription")}
      />
      {payables.data ? (
        <Pagination
          className="mt-4"
          page={Math.min(payables.data.meta.page, REPORT_MAX_PAGE)}
          pageSize={payables.data.meta.limit}
          totalItems={payables.data.meta.total}
          onPageChange={(next) => setPage(Math.min(next, REPORT_MAX_PAGE))}
          onPageSizeChange={setLimit}
          pageSizeOptions={[...REPORT_PAGE_SIZE_OPTIONS]}
        />
      ) : null}
    </div>
  );
}
