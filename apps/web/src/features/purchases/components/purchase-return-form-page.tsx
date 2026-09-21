"use client";

import { createPurchaseReturnSchema } from "@daljir/validation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/form";
import { ErrorState } from "@/components/ui/error-state";
import { NumberField, TextareaField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatMoney, formatQuantity } from "@/lib/format";
import { applyFieldErrors, userFacingError } from "@/lib/form-resolver";
import { useProducts } from "@/features/inventory/hooks";
import { useCreatePurchaseReturn, usePurchase } from "@/features/purchases/hooks";

interface ReturnFormValues {
  reason: string;
  items: { purchaseItemId: string; quantity: number }[];
}

export function PurchaseReturnFormPage({ purchaseId }: { purchaseId: string }) {
  const t = useTranslations("purchaseReturns");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();

  const purchase = usePurchase(purchaseId);
  const products = useProducts({ page: 1, pageSize: 100 });
  const createReturn = useCreatePurchaseReturn();

  const form = useForm<ReturnFormValues>({
    defaultValues: { reason: "", items: [] },
  });

  React.useEffect(() => {
    if (!purchase.data?.items) return;
    form.reset({
      reason: "",
      items: purchase.data.items.map((item) => ({ purchaseItemId: item.id, quantity: 0 })),
    });
  }, [purchase.data, form]);

  const productNameById = new Map(
    (products.data?.data ?? []).map((product) => [product.id, `${product.name} (${product.sku})`]),
  );

  async function onSubmit(values: ReturnFormValues) {
    const items = values.items.filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
    const parsed = createPurchaseReturnSchema.safeParse({
      reason: values.reason || undefined,
      items,
    });
    if (!parsed.success) {
      form.setError("root", { message: t("noQuantities") });
      return;
    }
    try {
      const created = await createReturn.mutateAsync({ purchaseId, input: parsed.data });
      toast({ title: t("created"), variant: "success" });
      router.push(`/purchases/returns/${created.id}`);
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
      }
    }
  }

  if (purchase.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (purchase.isError || !purchase.data) {
    return (
      <ErrorState
        description={userFacingError(purchase.error, tc("error"), tc("forbidden"))}
        onRetry={() => purchase.refetch()}
      />
    );
  }

  return (
    <div>
      <Link href={`/purchases/${purchaseId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToPurchase")}
      </Link>

      <h1 className="mt-4 font-display text-4xl">{t("newReturn")}</h1>
      <p className="mt-1 text-sm text-muted">{purchase.data.purchaseNumber}</p>

      <form className="mt-6 space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <h2 className="font-display text-2xl">{t("items")}</h2>
          {form.formState.errors.root?.message ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <div className="mt-4 space-y-4">
            {(purchase.data.items ?? []).map((item, index) => (
              <div key={item.id} className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <p className="text-sm font-medium text-ink">{productNameById.get(item.productId) ?? item.productId}</p>
                  <p className="text-xs text-muted">
                    {t("received")}: {formatQuantity(item.quantity)} · {formatMoney(item.unitCost)}
                  </p>
                </div>
                <input type="hidden" {...form.register(`items.${index}.purchaseItemId`)} />
                <NumberField
                  label={t("quantity")}
                  kind="quantity"
                  {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                  error={form.formState.errors.items?.[index]?.quantity?.message}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <TextareaField label={t("reason")} {...form.register("reason")} error={form.formState.errors.reason?.message} />
        </Card>

        <div className="flex justify-end gap-3">
          <Link
            href={`/purchases/${purchaseId}`}
            className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-ink"
          >
            {tc("cancel")}
          </Link>
          <Button type="submit" disabled={createReturn.isPending || form.formState.isSubmitting}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
