"use client";

import { createSupplierPaymentSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { DateField, NumberField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { applyFieldErrors, isPositiveDecimal, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { PAYMENT_METHODS } from "@/features/purchases/api";
import { useCreateSupplierPayment, usePurchases, useSuppliers } from "@/features/purchases/hooks";

const paymentFormSchema = createSupplierPaymentSchema.extend({
  supplierId: z.string().min(1),
});

interface PaymentFormValues {
  supplierId: string;
  purchaseId: string;
  amount: number;
  method: (typeof PAYMENT_METHODS)[number];
  reference: string;
  notes: string;
  paidAt: string;
}

export function SupplierPaymentFormPage() {
  const t = useTranslations("supplierPayments");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSupplierId = searchParams.get("supplierId") ?? "";
  const preselectedPurchaseId = searchParams.get("purchaseId") ?? "";

  const suppliers = useSuppliers({ page: 1, pageSize: 100, status: "ACTIVE" });
  const createPayment = useCreateSupplierPayment();

  const form = useForm<PaymentFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(paymentFormSchema) as unknown as Resolver<PaymentFormValues>,
    ),
    defaultValues: {
      supplierId: preselectedSupplierId,
      purchaseId: preselectedPurchaseId,
      amount: 0,
      method: "CASH",
      reference: "",
      notes: "",
      paidAt: "",
    },
  });

  React.useEffect(() => {
    if (preselectedSupplierId) form.setValue("supplierId", preselectedSupplierId);
    if (preselectedPurchaseId) form.setValue("purchaseId", preselectedPurchaseId);
  }, [preselectedSupplierId, preselectedPurchaseId, form]);

  const supplierId = form.watch("supplierId");
  const outstandingPurchases = usePurchases({
    page: 1,
    pageSize: 100,
    supplierId: supplierId || undefined,
  });

  const payablePurchases = (outstandingPurchases.data?.data ?? []).filter((purchase) =>
    isPositiveDecimal(purchase.amountDue),
  );

  async function onSubmit(values: PaymentFormValues) {
    try {
      await createPayment.mutateAsync({
        supplierId: values.supplierId,
        input: {
          purchaseId: values.purchaseId || undefined,
          amount: values.amount,
          method: values.method,
          reference: values.reference || undefined,
          notes: values.notes || undefined,
          paidAt: values.paidAt ? new Date(values.paidAt) : undefined,
        },
      });
      toast({ title: t("recorded"), variant: "success" });
      router.push("/payments");
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
      }
    }
  }

  if (suppliers.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (suppliers.isError) {
    return (
      <ErrorState
        description={userFacingError(suppliers.error, tc("error"), tc("forbidden"))}
        onRetry={() => suppliers.refetch()}
      />
    );
  }

  if ((suppliers.data?.data ?? []).length === 0) {
    return (
      <EmptyState
        title={t("noSuppliers")}
        description={t("noSuppliersDescription")}
        action={
          <Link
            href="/suppliers"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("manageSuppliers")}
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <Link href="/payments" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToPayments")}
      </Link>

      <h1 className="mt-4 font-display text-4xl">{t("recordPayment")}</h1>

      <form className="mt-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("supplier")}
            required
            {...form.register("supplierId")}
            error={form.formState.errors.supplierId?.message}
          >
            <option value="">{t("selectSupplier")}</option>
            {(suppliers.data?.data ?? []).map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
                {isPositiveDecimal(supplier.currentBalance) ? ` · ${formatMoney(supplier.currentBalance)}` : ""}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("purchase")}
            {...form.register("purchaseId")}
            error={form.formState.errors.purchaseId?.message}
          >
            <option value="">{t("onAccount")}</option>
            {payablePurchases.map((purchase) => (
              <option key={purchase.id} value={purchase.id}>
                {purchase.purchaseNumber} · {formatMoney(purchase.amountDue)}
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
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {td(`method.${method}`)}
              </option>
            ))}
          </SelectField>
          <TextField label={t("reference")} {...form.register("reference")} />
          <DateField label={t("paidAt")} includeTime {...form.register("paidAt")} />
          <TextareaField label={t("notes")} wrapperClassName="sm:col-span-2" {...form.register("notes")} />
        </Card>

        <div className="mt-6 flex justify-end gap-3">
          <Link
            href="/payments"
            className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-ink"
          >
            {tc("cancel")}
          </Link>
          <Button type="submit" disabled={createPayment.isPending || form.formState.isSubmitting}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
