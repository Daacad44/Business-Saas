"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoiceReceipt } from "@/features/invoices/hooks";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useSale } from "../hooks";
import { ProductName } from "./product-name";

export function SaleReceiptPage({ saleId }: { saleId: string }) {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const sale = useSale(saleId);
  const invoiceId = sale.data?.invoice?.id ?? "";
  const receipt = useInvoiceReceipt(invoiceId, Boolean(invoiceId));

  if (sale.isLoading || (invoiceId && receipt.isLoading)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
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

  if (!sale.data.invoice) {
    return <EmptyState title={t("noInvoice")} description={t("noInvoiceDescription")} />;
  }

  if (receipt.isError || !receipt.data) {
    return (
      <ErrorState
        description={userFacingError(receipt.error, tc("error"), tc("forbidden"))}
        onRetry={() => receipt.refetch()}
      />
    );
  }

  const data = receipt.data;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/sales/${saleId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("backToSale")}
        </Link>
        <Button type="button" onClick={() => window.print()}>
          {t("printReceipt")}
        </Button>
      </div>

      {justCreated ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 print:hidden">
          {t("createdBanner")}
        </div>
      ) : null}

      <article className="mx-auto max-w-xl rounded-3xl border border-line bg-paper p-8 print:border-0 print:p-0">
        <header className="text-center">
          <p className="font-display text-3xl">{data.business?.name ?? t("receipt")}</p>
          <p className="mt-1 text-sm text-muted">{t("receipt")}</p>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted">{t("saleNumber")}</dt>
            <dd className="font-semibold">{data.sale.saleNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("invoice")}</dt>
            <dd className="font-semibold">{data.invoice.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("date")}</dt>
            <dd>{formatDateTime(data.sale.soldAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("type")}</dt>
            <dd>{data.sale.type === "CASH" ? t("typeCash") : t("typeCredit")}</dd>
          </div>
          {data.customer ? (
            <div className="col-span-2">
              <dt className="text-muted">{t("customer")}</dt>
              <dd>
                {data.customer.fullName}
                {data.customer.phone ? ` · ${data.customer.phone}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>

        <table className="mt-6 w-full text-sm">
          <caption className="sr-only">{t("lineItems")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2">{t("item")}</th>
              <th className="py-2 text-right">{t("quantity")}</th>
              <th className="py-2 text-right">{t("unitPrice")}</th>
              <th className="py-2 text-right">{t("lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {data.sale.items.map((item) => (
              <tr key={item.id} className="border-b border-line last:border-0">
                <td className="py-2">
                  <ProductName productId={item.productId} />
                </td>
                <td className="py-2 text-right">{formatQuantity(item.quantity)}</td>
                <td className="py-2 text-right">{formatMoney(item.unitPrice)}</td>
                <td className="py-2 text-right">{formatMoney(item.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-6 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>{t("subtotal")}</dt>
            <dd>{formatMoney(data.invoice.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("discount")}</dt>
            <dd>{formatMoney(data.invoice.discountAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("tax")}</dt>
            <dd>{formatMoney(data.invoice.taxAmount)}</dd>
          </div>
          <div className="flex justify-between font-display text-2xl">
            <dt>{t("total")}</dt>
            <dd>{formatMoney(data.invoice.totalAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("amountPaid")}</dt>
            <dd>{formatMoney(data.invoice.amountPaid)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("amountDue")}</dt>
            <dd>{formatMoney(data.invoice.amountDue)}</dd>
          </div>
        </dl>

        {data.payments.length > 0 ? (
          <div className="mt-6 text-sm">
            <p className="font-semibold">{t("payments")}</p>
            <ul className="mt-2 space-y-1">
              {data.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between">
                  <span>
                    {t(`method.${payment.method}`)} · {formatDate(payment.paidAt)}
                  </span>
                  <span>{formatMoney(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>
    </div>
  );
}
