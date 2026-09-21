"use client";

import type { ProductVariantSummary } from "@daljir/types";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";

export function VariantPickerModal({
  open,
  onClose,
  productName,
  variants,
  isLoading,
  isError,
  error,
  onRetry,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  productName: string;
  variants: ProductVariantSummary[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onSelect: (variant: ProductVariantSummary) => void;
}) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");

  return (
    <Modal open={open} onClose={onClose} title={t("selectVariant")} description={productName}>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}
      {isError ? (
        <ErrorState description={userFacingError(error, tc("error"), tc("forbidden"))} onRetry={onRetry} />
      ) : null}
      {!isLoading && !isError && variants.length === 0 ? <EmptyState title={t("noVariants")} /> : null}
      {!isLoading && !isError
        ? variants
            .filter((variant) => variant.status === "ACTIVE")
            .map((variant) => (
              <Button
                key={variant.id}
                type="button"
                variant="secondary"
                className="mb-2 w-full justify-between"
                onClick={() => onSelect(variant)}
              >
                <span>
                  {variant.name} · {variant.sku}
                </span>
                <span>{formatMoney(variant.sellingPrice)}</span>
              </Button>
            ))
        : null}
    </Modal>
  );
}
