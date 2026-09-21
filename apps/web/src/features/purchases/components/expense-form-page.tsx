"use client";

import { createExpenseSchema, updateExpenseSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";
import type { ZodType } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { DateField, NumberField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useBranches } from "@/features/inventory/hooks";
import { PAYMENT_METHODS } from "@/features/purchases/api";
import { useCreateExpense, useExpense, useExpenseCategories, useUpdateExpense } from "@/features/purchases/hooks";

interface ExpenseFormValues {
  categoryId: string;
  branchId: string;
  amount: number;
  description: string;
  method: (typeof PAYMENT_METHODS)[number] | "";
  reference: string;
  expenseDate: string;
}

function isoToDateInput(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ExpenseFormPage({ expenseId }: { expenseId?: string }) {
  const t = useTranslations("expenses");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const isEdit = Boolean(expenseId);

  const categories = useExpenseCategories();
  const branches = useBranches();
  const existing = useExpense(expenseId ?? "");
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();

  const form = useForm<ExpenseFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver((isEdit ? updateExpenseSchema : createExpenseSchema) as unknown as ZodType<ExpenseFormValues>) as Resolver<ExpenseFormValues>,
    ),
    defaultValues: {
      categoryId: "",
      branchId: "",
      amount: 0,
      description: "",
      method: "CASH",
      reference: "",
      expenseDate: "",
    },
    values: existing.data
      ? {
          categoryId: existing.data.categoryId,
          branchId: existing.data.branchId ?? "",
          amount: Number(existing.data.amount),
          description: existing.data.description,
          method: existing.data.method ?? "",
          reference: existing.data.reference ?? "",
          expenseDate: isoToDateInput(existing.data.expenseDate),
        }
      : undefined,
  });

  async function onSubmit(values: ExpenseFormValues) {
    try {
      if (isEdit && expenseId) {
        await updateExpense.mutateAsync({
          id: expenseId,
          input: {
            categoryId: values.categoryId,
            branchId: values.branchId || null,
            amount: values.amount,
            description: values.description,
            method: values.method || null,
            reference: values.reference || null,
            expenseDate: values.expenseDate ? new Date(values.expenseDate) : undefined,
          },
        });
        toast({ title: t("updated"), variant: "success" });
        router.push(`/expenses/${expenseId}`);
      } else {
        const created = await createExpense.mutateAsync({
          categoryId: values.categoryId,
          branchId: values.branchId || undefined,
          amount: values.amount,
          description: values.description,
          method: values.method || undefined,
          reference: values.reference || undefined,
          expenseDate: values.expenseDate ? new Date(values.expenseDate) : undefined,
        });
        toast({ title: t("created"), variant: "success" });
        router.push(`/expenses/${created.id}`);
      }
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
      }
    }
  }

  if (categories.isLoading || (isEdit && existing.isLoading)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (categories.isError) {
    return (
      <ErrorState
        description={userFacingError(categories.error, tc("error"), tc("forbidden"))}
        onRetry={() => categories.refetch()}
      />
    );
  }

  if (isEdit && (existing.isError || !existing.data)) {
    return (
      <ErrorState
        description={userFacingError(existing.error, tc("error"), tc("forbidden"))}
        onRetry={() => existing.refetch()}
      />
    );
  }

  if ((categories.data ?? []).length === 0) {
    return (
      <EmptyState
        title={t("noCategories")}
        description={t("noCategoriesDescription")}
        action={
          <Link
            href="/expenses/categories"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("manageCategories")}
          </Link>
        }
      />
    );
  }

  const pending = createExpense.isPending || updateExpense.isPending;

  return (
    <div>
      <Link href={isEdit && expenseId ? `/expenses/${expenseId}` : "/expenses"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToExpenses")}
      </Link>

      <h1 className="mt-4 font-display text-4xl">{isEdit ? t("editTitle") : t("newExpense")}</h1>

      <form className="mt-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="grid gap-4 sm:grid-cols-2">
          <TextareaField
            label={t("description")}
            required
            wrapperClassName="sm:col-span-2"
            {...form.register("description")}
            error={form.formState.errors.description?.message}
          />
          <SelectField
            label={t("category")}
            required
            {...form.register("categoryId")}
            error={form.formState.errors.categoryId?.message}
          >
            <option value="">{t("selectCategory")}</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={t("branch")} {...form.register("branchId")} error={form.formState.errors.branchId?.message}>
            <option value="">{t("noBranch")}</option>
            {(branches.data ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectField>
          <NumberField
            label={t("amount")}
            kind="money"
            required
            {...form.register("amount", { valueAsNumber: true })}
            error={form.formState.errors.amount?.message}
          />
          <SelectField label={t("method")} {...form.register("method")}>
            <option value="">{t("noMethod")}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {td(`method.${method}`)}
              </option>
            ))}
          </SelectField>
          <TextField label={t("reference")} {...form.register("reference")} />
          <DateField label={t("expenseDate")} {...form.register("expenseDate")} />
        </Card>

        <div className="mt-6 flex justify-end gap-3">
          <Link
            href={isEdit && expenseId ? `/expenses/${expenseId}` : "/expenses"}
            className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-ink"
          >
            {tc("cancel")}
          </Link>
          <Button type="submit" disabled={pending || form.formState.isSubmitting}>
            {isEdit ? tc("save") : t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
