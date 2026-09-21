"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api-errors";
import { useCustomerDebts, useCustomerPayments, useCustomerSales } from "@/features/customers/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import type { CustomerDebtSummary, DebtPaymentSummary, DebtStatus, SaleSummary } from "@daljir/types";

const DEBT_STATUS_VARIANT: Record<DebtStatus, "neutral" | "info" | "warning" | "danger" | "success"> = {
  PENDING: "neutral",
  DUE_SOON: "info",
  DUE_TODAY: "warning",
  OVERDUE: "danger",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "neutral",
};

export function CustomerSalesTab({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { state, setPage, setPageSize } = useListState({});
  const sales = useCustomerSales(customerId, state.page, state.pageSize);

  const columns: DataTableColumn<SaleSummary>[] = [
    { id: "saleNumber", header: t("saleNumber"), accessor: (row) => row.saleNumber },
    { id: "soldAt", header: t("date"), accessor: (row) => formatDateTime(row.soldAt) },
    { id: "type", header: t("saleType"), accessor: (row) => row.type },
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
        error={sales.isError ? errorMessage(sales.error, tc("error")) : undefined}
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
      accessor: (row) => <Badge variant={DEBT_STATUS_VARIANT[row.status]}>{td(`status.${row.status}`)}</Badge>,
    },
  ];

  return (
    <DataTable
      caption={t("debts")}
      columns={columns}
      data={debts.data ?? []}
      getRowId={(row) => row.id}
      isLoading={debts.isLoading}
      error={debts.isError ? errorMessage(debts.error, tc("error")) : undefined}
      onRetry={() => debts.refetch()}
      emptyTitle={t("noDebts")}
    />
  );
}

export function CustomerPaymentsTab({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const payments = useCustomerPayments(customerId);

  const columns: DataTableColumn<DebtPaymentSummary>[] = [
    { id: "paidAt", header: t("date"), accessor: (row) => formatDateTime(row.paidAt) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "method", header: t("method"), accessor: (row) => row.method },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
  ];

  return (
    <DataTable
      caption={t("payments")}
      columns={columns}
      data={payments.data ?? []}
      getRowId={(row) => row.id}
      isLoading={payments.isLoading}
      error={payments.isError ? errorMessage(payments.error, tc("error")) : undefined}
      onRetry={() => payments.refetch()}
      emptyTitle={t("noPayments")}
    />
  );
}
