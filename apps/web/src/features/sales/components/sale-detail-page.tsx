"use client";

import type { InvoiceStatus, PaymentSummary, SaleItemSummary, SaleStatus } from "@daljir/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useSale } from "../hooks";
import { ProductName } from "./product-name";

const SALE_STATUS_VARIANT: Record<SaleStatus, "neutral" | "success" | "danger"> = {
  DRAFT: "neutral",
  COMPLETED: "success",
  VOIDED: "danger",
};

const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "neutral",
};

export function SaleDetailPage({ saleId }: { saleId: string }) {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const canReturn = useHasPermission("sales.update");
  const canCollect = useHasPermission("debts.collect");

  const sale = useSale(saleId);

  if (sale.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (sale.isError || !sale.data) {
    return (
      <ErrorState
        description={userFacingError(sale.error, tc("error"), tc("forbidden"))}
        onRetry={() => sale.refetch()}
      />
    );
  }

  const data = sale.data;
  const invoice = data.invoice;

  const itemColumns: DataTableColumn<SaleItemSummary>[] = [
    {
      id: "product",
      header: t("item"),
      accessor: (row) => <ProductName productId={row.productId} />,
    },
    {
      id: "quantity",
      header: t("quantity"),
      align: "end",
      accessor: (row) => formatQuantity(row.quantity),
    },
    {
      id: "unitPrice",
      header: t("unitPrice"),
      align: "end",
      accessor: (row) => formatMoney(row.unitPrice),
    },
    {
      id: "discountAmount",
      header: t("discount"),
      align: "end",
      accessor: (row) => formatMoney(row.discountAmount),
    },
    {
      id: "taxAmount",
      header: t("tax"),
      align: "end",
      accessor: (row) => formatMoney(row.taxAmount),
    },
    {
      id: "totalAmount",
      header: t("lineTotal"),
      align: "end",
      accessor: (row) => formatMoney(row.totalAmount),
    },
  ];

  const paymentColumns: DataTableColumn<PaymentSummary>[] = [
    { id: "paidAt", header: t("date"), accessor: (row) => formatDateTime(row.paidAt) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "method", header: t("methodLabel"), accessor: (row) => t(`method.${row.method}`) },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
  ];

  return (
    <div>
      <Link href="/sales" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToSales")}
      </Link>

      {justCreated ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t("createdBanner")}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.saleNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(data.soldAt)} · {data.type === "CASH" ? t("typeCash") : t("typeCredit")}
          </p>
        </div>
        <Badge variant={SALE_STATUS_VARIANT[data.status]}>{t(`status.${data.status}`)}</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <StatCard label={t("subtotal")} value={formatMoney(data.subtotal)} />
        <StatCard label={t("discount")} value={formatMoney(data.discountAmount)} />
        <StatCard label={t("tax")} value={formatMoney(data.taxAmount)} />
        <StatCard label={t("total")} value={formatMoney(data.totalAmount)} />
      </div>

      {invoice ? (
        <div className="mt-6 rounded-3xl border border-line bg-paper p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{t("invoice")}</p>
              <p className="font-display text-2xl">{invoice.invoiceNumber}</p>
            </div>
            <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>{t(`invoiceStatus.${invoice.status}`)}</Badge>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">{t("amountPaid")}</dt>
              <dd className="font-semibold">{formatMoney(invoice.amountPaid)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("amountDue")}</dt>
              <dd className="font-semibold">{formatMoney(invoice.amountDue)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("dueDate")}</dt>
              <dd className="font-semibold">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {invoice ? (
          <Link href={`/sales/${saleId}/receipt`}>
            <Button variant="secondary">{t("viewReceipt")}</Button>
          </Link>
        ) : null}
        {canReturn && data.status === "COMPLETED" ? (
          <Link href={`/sales/${saleId}/return`}>
            <Button variant="secondary">{t("processReturn")}</Button>
          </Link>
        ) : null}
        {canCollect && invoice && invoice.status !== "PAID" && invoice.status !== "VOID" ? (
          <Link href={`/invoices/${invoice.id}`}>
            <Button>{t("recordPayment")}</Button>
          </Link>
        ) : null}
        <Link href="/pos">
          <Button variant="ghost">{t("newSale")}</Button>
        </Link>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-2xl">{t("lineItems")}</h2>
        <div className="mt-3">
          <DataTable
            caption={t("lineItems")}
            columns={itemColumns}
            data={data.items}
            getRowId={(row) => row.id}
            emptyTitle={t("noItems")}
          />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-2xl">{t("payments")}</h2>
        <div className="mt-3">
          <DataTable
            caption={t("payments")}
            columns={paymentColumns}
            data={data.payments}
            getRowId={(row) => row.id}
            emptyTitle={t("noPayments")}
          />
        </div>
      </div>
    </div>
  );
}
