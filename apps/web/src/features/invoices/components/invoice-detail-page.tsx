"use client";

import type { InvoiceStatus, PaymentSummary, SaleItemSummary } from "@daljir/types";
import { createSalePaymentSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/form";
import { NumberField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { ProductName } from "@/features/sales/components/product-name";
import { useCreateSalePayment } from "@/features/sales/hooks";
import { saleErrorMessage } from "@/features/sales/lib/sale-error-message";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useHasPermission } from "@/lib/permissions";
import { useInvoice } from "../hooks";

const METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT_NOTE", "OTHER"] as const;

const STATUS_VARIANT: Record<InvoiceStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "neutral",
};

interface PaymentFormValues {
  amount: number;
  method: (typeof METHODS)[number];
  reference: string;
  notes: string;
}

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("invoices");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCollect = useHasPermission("debts.collect");
  const invoice = useInvoice(invoiceId);
  const createPayment = useCreateSalePayment();
  const [submitLocked, setSubmitLocked] = React.useState(false);

  const form = useForm<PaymentFormValues>({
    resolver: withBlankAsUndefined(zodResolver(createSalePaymentSchema) as unknown as Resolver<PaymentFormValues>),
    defaultValues: { amount: 0, method: "CASH", reference: "", notes: "" },
  });

  async function onSubmit(values: PaymentFormValues) {
    if (submitLocked || createPayment.isPending || !invoice.data?.saleId) return;
    setSubmitLocked(true);
    try {
      const result = await createPayment.mutateAsync({
        saleId: invoice.data.saleId,
        input: {
          amount: values.amount,
          method: values.method,
          reference: values.reference || undefined,
          notes: values.notes || undefined,
        },
      });
      toast({
        title: t("paymentRecorded"),
        description: t("outstandingAfterPayment", { amount: formatMoney(result.invoice.amountDue) }),
        variant: "success",
      });
      form.reset({ amount: 0, method: "CASH", reference: "", notes: "" });
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({
          title: saleErrorMessage(error, (key) => ts(key), tc("error"), tc("forbidden")),
          variant: "error",
        });
      }
    } finally {
      setSubmitLocked(false);
    }
  }

  if (invoice.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (invoice.isError || !invoice.data) {
    return (
      <ErrorState
        description={userFacingError(invoice.error, tc("error"), tc("forbidden"))}
        onRetry={() => invoice.refetch()}
      />
    );
  }

  const data = invoice.data;
  const canPay = canCollect && data.status !== "PAID" && data.status !== "VOID";

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
      id: "totalAmount",
      header: t("lineTotal"),
      align: "end",
      accessor: (row) => formatMoney(row.totalAmount),
    },
  ];

  const paymentColumns: DataTableColumn<PaymentSummary>[] = [
    { id: "paidAt", header: t("date"), accessor: (row) => formatDateTime(row.paidAt) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "method", header: t("methodLabel"), accessor: (row) => ts(`method.${row.method}`) },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
  ];

  return (
    <div>
      <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToInvoices")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("issuedAt")}: {formatDate(data.issuedAt)}
            {data.sale ? (
              <>
                {" · "}
                <Link href={`/sales/${data.saleId}`} className="underline">
                  {data.sale.saleNumber}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[data.status]}>{t(`status.${data.status}`)}</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("total")} value={formatMoney(data.totalAmount)} />
        <StatCard label={t("amountPaid")} value={formatMoney(data.amountPaid)} />
        <StatCard label={t("amountDue")} value={formatMoney(data.amountDue)} />
      </div>

      {data.sale?.items ? (
        <div className="mt-8">
          <h2 className="font-display text-2xl">{t("lineItems")}</h2>
          <div className="mt-3">
            <DataTable
              caption={t("lineItems")}
              columns={itemColumns}
              data={data.sale.items}
              getRowId={(row) => row.id}
              emptyTitle={t("noItems")}
            />
          </div>
        </div>
      ) : null}

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

      {canPay ? (
        <Card className="mt-8">
          <h2 className="font-display text-2xl">{t("recordPayment")}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("outstandingAmount")}: {formatMoney(data.amountDue)}
          </p>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
            <NumberField
              label={t("amount")}
              kind="money"
              required
              {...form.register("amount", { valueAsNumber: true })}
              error={form.formState.errors.amount?.message}
            />
            <SelectField label={t("methodLabel")} {...form.register("method")}>
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {ts(`method.${method}`)}
                </option>
              ))}
            </SelectField>
            <TextField label={t("reference")} {...form.register("reference")} />
            <TextareaField label={t("notes")} {...form.register("notes")} />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createPayment.isPending || submitLocked || form.formState.isSubmitting}>
                {t("recordPayment")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
