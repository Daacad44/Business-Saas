"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useCustomerDebts, useCustomerPayments, useCustomerSales } from "@/features/customers/hooks";
import { DebtStatusBadges } from "@/features/debts/components/debt-status-badges";
import { useBusinessTimezone } from "@/features/debts/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import type { CustomerDebtSummary, DebtPaymentSummary, SaleSummary } from "@daljir/types";

export function CustomerSalesTab({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { state, setPage, setPageSize } = useListState({});
  const sales = useCustomerSales(customerId, state.page, state.pageSize);

  const columns: DataTableColumn<SaleSummary>[] = [
    { id: "saleNumber", header: t("saleNumber"), accessor: (row) => row.saleNumber },
    { id: "soldAt", header: t("date"), accessor: (row) => formatDateTime(row.soldAt) },
    { id: "type", header: t("saleType"), accessor: (row) => (row.type === "CREDIT" ? t("saleTypeCredit") : t("saleTypeCash")) },
    { id: "totalAmount", header: t("total"), align: "end", accessor: (row) => formatMoney(row.totalAmount) },
  ];

  return (
    <div>
      <DataTable
        caption={t("salesHistory")}
        columns={columns}
        data={sales.data?.data ?? []}
        getRowId={(row) => row.id}
        isLoading={sales.isLoading}
        error={sales.isError ? userFacingError(sales.error, tc("error"), tc("forbidden")) : undefined}
        onRetry={() => sales.refetch()}
        emptyTitle={t("noSales")}
      />
      {sales.data ? (
        <Pagination
          className="mt-4"
          page={sales.data.meta.page}
          pageSize={sales.data.meta.pageSize}
          totalItems={sales.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}

export function CustomerDebtsTab({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const debts = useCustomerDebts(customerId);
  const { timeZone } = useBusinessTimezone();

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
    { id: "dueDate", header: td("dueDate"), accessor: (row) => formatDateTime(row.dueDate) },
    {
      id: "outstanding",
      header: td("outstandingAmount"),
      align: "end",
      accessor: (row) => formatMoney(row.outstandingAmount),
    },
    {
      id: "status",
      header: td("statusLabel"),
      align: "center",
      accessor: (row) => (
        <DebtStatusBadges
          status={row.status}
          dueDate={row.dueDate}
          outstandingAmount={row.outstandingAmount}
          timeZone={timeZone}
        />
      ),
    },
  ];

  return (
    <DataTable
      caption={t("debts")}
      columns={columns}
      data={debts.data ?? []}
      getRowId={(row) => row.id}
      isLoading={debts.isLoading}
      error={debts.isError ? userFacingError(debts.error, tc("error"), tc("forbidden")) : undefined}
      onRetry={() => debts.refetch()}
      emptyTitle={t("noDebts")}
    />
  );
}

export function CustomerPaymentsTab({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const payments = useCustomerPayments(customerId);

  const columns: DataTableColumn<DebtPaymentSummary>[] = [
    { id: "paidAt", header: t("date"), accessor: (row) => formatDateTime(row.paidAt) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "method", header: t("method"), accessor: (row) => td(`method.${row.method}`) },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
  ];

  return (
    <DataTable
      caption={t("payments")}
      columns={columns}
      data={payments.data ?? []}
      getRowId={(row) => row.id}
      isLoading={payments.isLoading}
      error={payments.isError ? userFacingError(payments.error, tc("error"), tc("forbidden")) : undefined}
      onRetry={() => payments.refetch()}
      emptyTitle={t("noPayments")}
    />
  );
}
