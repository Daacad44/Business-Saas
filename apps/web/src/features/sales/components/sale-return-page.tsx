"use client";

import type { ProductSummary, SaleItemSummary } from "@daljir/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TextareaField, TextField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ProductPicker } from "@/features/shared/product-picker";
import { isPositiveDecimal, userFacingError } from "@/lib/form-resolver";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useHasPermission } from "@/lib/permissions";
import { saleErrorMessage } from "../lib/sale-error-message";
import { parseOverReturn } from "../lib/sale-errors";
import {
  decimalStringToJsonNumber,
  isGreaterThan,
  isNegative,
  mustParseDecimal,
  subtract,
  toFixed,
} from "@/features/pos/lib/decimal-math";
import { useCreateSalesReturn, useSale } from "../hooks";
import { ProductName } from "./product-name";

function remainingQuantity(sold: string, alreadyReturned: string): string {
  const remaining = subtract(mustParseDecimal(sold), mustParseDecimal(alreadyReturned));
  return isNegative(remaining) ? "0.000" : toFixed(remaining, 3);
}

export function SaleReturnPage({ saleId }: { saleId: string }) {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const canReturn = useHasPermission("sales.update");

  const sale = useSale(saleId);
  const createReturn = useCreateSalesReturn();
  const [submitLocked, setSubmitLocked] = React.useState(false);
  const [alreadyReturned, setAlreadyReturned] = React.useState<Record<string, string>>({});
  const [filterProductId, setFilterProductId] = React.useState<string | null>(null);
  const [lineError, setLineError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});

  const itemById = new Map((sale.data?.items ?? []).map((item) => [item.id, item]));

  function remainingFor(item: SaleItemSummary): string {
    return remainingQuantity(item.quantity, alreadyReturned[item.id] ?? "0");
  }

  function exceedsRemaining(item: SaleItemSummary, requested: string): boolean {
    if (!requested.trim()) return false;
    if (!isPositiveDecimal(requested) && requested !== "0" && requested !== "0.000" && requested !== "0.00") {
      return true;
    }
    return isGreaterThan(mustParseDecimal(requested), mustParseDecimal(remainingFor(item)));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLocked || createReturn.isPending) return;
    const returning = Object.entries(quantities).filter(([, quantity]) => isPositiveDecimal(quantity));
    if (returning.length === 0) {
      setLineError(t("returnNothingSelected"));
      return;
    }
    for (const [saleItemId, quantity] of returning) {
      const item = itemById.get(saleItemId);
      if (!item) continue;
      if (exceedsRemaining(item, quantity)) {
        setLineError(t("returnExceedsRemaining"));
        return;
      }
    }
    setSubmitLocked(true);
    setLineError(null);
    try {
      await createReturn.mutateAsync({
        saleId,
        input: {
          reason: reason.trim() || undefined,
          items: returning.map(([saleItemId, quantity]) => ({
            saleItemId,
            quantity: decimalStringToJsonNumber(quantity),
          })),
        },
      });
      toast({ title: t("returnCreated"), variant: "success" });
      router.push(`/sales/${saleId}`);
    } catch (error) {
      setSubmitLocked(false);
      const parsed = parseOverReturn(error);
      if (parsed) {
        const targetId = parsed.saleItemId ?? returning[0]?.[0];
        if (targetId) {
          setAlreadyReturned((current) => ({ ...current, [targetId]: parsed.alreadyReturned }));
        }
        setLineError(t("returnExceedsRemaining"));
      }
      toast({
        title: saleErrorMessage(
          error,
          (key) => t(key),
          userFacingError(error, tc("error"), tc("forbidden")),
          tc("forbidden"),
        ),
        variant: "error",
      });
    }
  }

  if (sale.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
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

  if (!canReturn) {
    return <ErrorState description={tc("forbidden")} />;
  }

  const visibleItems = sale.data.items.filter((item) => !filterProductId || item.productId === filterProductId);

  return (
    <div>
      <Link href={`/sales/${saleId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToSale")}
      </Link>
      <h1 className="mt-4 font-display text-4xl">{t("returnTitle", { number: sale.data.saleNumber })}</h1>
      <p className="mt-2 text-sm text-muted">{t("returnHint")}</p>

      <div className="mt-6 max-w-md">
        <ProductPicker
          label={t("filterProduct")}
          placeholder={t("filterProductPlaceholder")}
          value={filterProductId}
          onChange={(product: ProductSummary | null) => setFilterProductId(product?.id ?? null)}
        />
      </div>

      {visibleItems.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t("noMatchingItems")} description={t("noMatchingItemsDescription")} />
        </div>
      ) : (
        <form className="mt-6 space-y-6" onSubmit={onSubmit}>
          <Card className="space-y-4">
            {visibleItems.map((item) => {
              const remaining = remainingFor(item);
              const requested = quantities[item.id] ?? "0";
              const over = exceedsRemaining(item, requested);
              return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-[2fr_1fr_1fr_1fr]"
                >
                  <div>
                    <p className="font-semibold">
                      <ProductName productId={item.productId} />
                    </p>
                    <p className="text-xs text-muted">
                      {t("sold")}: {formatQuantity(item.quantity)} · {t("unitPrice")}: {formatMoney(item.unitPrice)}
                    </p>
                  </div>
                  <p className="text-sm">
                    <span className="block text-xs text-muted">{t("alreadyReturned")}</span>
                    {formatQuantity(alreadyReturned[item.id] ?? "0")}
                  </p>
                  <p className="text-sm">
                    <span className="block text-xs text-muted">{t("remainingReturnable")}</span>
                    {formatQuantity(remaining)}
                  </p>
                  <TextField
                    label={t("returnQuantity")}
                    inputMode="decimal"
                    value={requested}
                    error={over ? t("returnExceedsRemaining") : undefined}
                    onChange={(event) =>
                      setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                </div>
              );
            })}
          </Card>

          <TextareaField label={t("returnReason")} value={reason} onChange={(event) => setReason(event.target.value)} />

          {lineError ? (
            <p role="alert" className="text-sm text-red-700">
              {lineError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Link
              href={`/sales/${saleId}`}
              className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-ink"
            >
              {tc("cancel")}
            </Link>
            <Button type="submit" disabled={createReturn.isPending || submitLocked}>
              {t("submitReturn")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
