"use client";

import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api-errors";
import { useHasPermission } from "@/lib/permissions";
import { useDebt, useRemindDebt } from "@/features/debts/hooks";
import { RecordPaymentModal } from "./record-payment-modal";
import type { DebtStatus, DebtPaymentSummary } from "@daljir/types";

const STATUS_VARIANT: Record<DebtStatus, "neutral" | "info" | "warning" | "danger" | "success"> = {
  PENDING: "neutral",
  DUE_SOON: "info",
  DUE_TODAY: "warning",
  OVERDUE: "danger",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "neutral",
};

export function DebtDetailPage({ debtId }: { debtId: string }) {
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCollect = useHasPermission("debts.collect");
  const canRemind = useHasPermission("debts.remind");

  const debt = useDebt(debtId);
  const remindDebt = useRemindDebt();
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false);

  async function onRemind() {
    try {
      const result = await remindDebt.mutateAsync({ id: debtId, input: {} });
      toast({
        title: result.duplicated ? t("reminderAlreadySent") : t("reminderSent"),
        variant: result.duplicated ? "info" : "success",
      });
    } catch (error) {
      toast({ title: errorMessage(error, tc("error")), variant: "error" });
    }
  }

  if (debt.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (debt.isError || !debt.data) {
    return <ErrorState description={errorMessage(debt.error, tc("error"))} onRetry={() => debt.refetch()} />;
  }

  const data = debt.data;
  const canPay = canCollect && data.status !== "PAID" && data.status !== "CANCELLED";
  const canSendReminder = canRemind && Number(data.outstandingAmount) > 0;

  const paymentColumns: DataTableColumn<DebtPaymentSummary>[] = [
    { id: "paidAt", header: t("date"), accessor: (row) => formatDateTime(row.paidAt) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "method", header: t("methodLabel"), accessor: (row) => t(`method.${row.method}`) },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
  ];

  return (
    <div>
      <Link href="/debts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToDebts")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.customer.fullName}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("dueDate")}: {formatDate(data.dueDate)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[data.status]}>{t(`status.${data.status}`)}</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("principalAmount")} value={formatMoney(data.principalAmount)} />
        <StatCard label={t("amountPaid")} value={formatMoney(data.amountPaid)} />
        <StatCard label={t("outstandingAmount")} value={formatMoney(data.outstandingAmount)} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {canPay ? <Button onClick={() => setPaymentModalOpen(true)}>{t("recordPayment")}</Button> : null}
        {canSendReminder ? (
          <Button variant="secondary" onClick={onRemind} disabled={remindDebt.isPending}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("sendReminder")}
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        <h2 className="font-display text-2xl">{t("paymentHistory")}</h2>
        <div className="mt-3">
          <DataTable
            caption={t("paymentHistory")}
            columns={paymentColumns}
            data={data.payments}
            getRowId={(row) => row.id}
            emptyTitle={t("noPayments")}
          />
        </div>
      </div>

      <RecordPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        debtId={debtId}
        outstandingAmount={data.outstandingAmount}
      />
    </div>
  );
}
