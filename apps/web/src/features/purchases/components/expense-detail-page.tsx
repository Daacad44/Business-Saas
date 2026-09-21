"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useBranches } from "@/features/inventory/hooks";
import { useDeleteExpense, useExpense, useExpenseCategories } from "@/features/purchases/hooks";

export function ExpenseDetailPage({ expenseId }: { expenseId: string }) {
  const t = useTranslations("expenses");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const canCreate = useHasPermission("expenses.create");
  const expense = useExpense(expenseId);
  const categories = useExpenseCategories();
  const branches = useBranches();
  const deleteExpense = useDeleteExpense();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string>();

  async function confirmDelete() {
    try {
      await deleteExpense.mutateAsync(expenseId);
      toast({ title: t("deleted"), variant: "success" });
      router.push("/expenses");
    } catch (error) {
      setDeleteError(userFacingError(error, tc("error"), tc("forbidden")));
    }
  }

  if (expense.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (expense.isError || !expense.data) {
    return (
      <ErrorState
        description={userFacingError(expense.error, tc("error"), tc("forbidden"))}
        onRetry={() => expense.refetch()}
      />
    );
  }

  const data = expense.data;
  const categoryName = (categories.data ?? []).find((category) => category.id === data.categoryId)?.name ?? data.categoryId;
  const branchName = data.branchId
    ? ((branches.data ?? []).find((branch) => branch.id === data.branchId)?.name ?? data.branchId)
    : "—";

  return (
    <div>
      <Link href="/expenses" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToExpenses")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.description}</h1>
          <p className="mt-1 text-sm text-muted">
            {categoryName} · {formatDate(data.expenseDate)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("amount")} value={formatMoney(data.amount)} />
        <StatCard label={t("branch")} value={branchName} />
        <StatCard label={t("method")} value={data.method ? td(`method.${data.method}`) : "—"} />
      </div>

      {data.reference ? <p className="mt-4 text-sm text-muted">{t("reference")}: {data.reference}</p> : null}

      {canCreate ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/expenses/${data.id}/edit`}
            className="inline-flex h-9 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink hover:border-ink"
          >
            {tc("edit")}
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDeleteError(undefined);
              setDeleteOpen(true);
            }}
          >
            {tc("delete")}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title={t("deleteTitle")}
        description={deleteError ?? t("deleteBody")}
        destructive
        pending={deleteExpense.isPending}
      />
    </div>
  );
}
