"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatQuantity } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import {
  useCategories,
  useProduct,
  useProductVariants,
  useStockLevels,
  useUnits,
  useWarehouses,
} from "@/features/inventory/hooks";
import type { ProductVariantSummary, StockLevelSummary } from "@daljir/types";

export function ProductDetailPage({ productId }: { productId: string }) {
  const t = useTranslations("products");
  const tc = useTranslations("common");

  const product = useProduct(productId);
  const categories = useCategories();
  const units = useUnits();
  const variants = useProductVariants(productId);
  const warehouses = useWarehouses();
  const stockLevels = useStockLevels({ page: 1, pageSize: 100, productId });

  if (product.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (product.isError || !product.data) {
    return (
      <ErrorState
        description={userFacingError(product.error, tc("error"), tc("forbidden"))}
        onRetry={() => product.refetch()}
      />
    );
  }

  const data = product.data;
  const categoryName = categories.data?.find((category) => category.id === data.categoryId)?.name;
  const unit = units.data?.find((u) => u.id === data.unitId);
  const warehouseNameById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse.name]));

  const variantColumns: DataTableColumn<ProductVariantSummary>[] = [
    { id: "name", header: t("variantName"), accessor: (row) => row.name },
    { id: "sku", header: t("sku"), accessor: (row) => row.sku },
    { id: "sellingPrice", header: t("sellingPrice"), align: "end", accessor: (row) => formatMoney(row.sellingPrice) },
    {
      id: "status",
      header: t("status"),
      align: "center",
      accessor: (row) => (
        <Badge variant={row.status === "ACTIVE" ? "success" : "neutral"}>
          {row.status === "ACTIVE" ? t("statusActive") : t("statusArchived")}
        </Badge>
      ),
    },
  ];

  const stockColumns: DataTableColumn<StockLevelSummary>[] = [
    {
      id: "warehouse",
      header: t("warehouse"),
      accessor: (row) => warehouseNameById.get(row.warehouseId) ?? row.warehouseId,
    },
    {
      id: "quantity",
      header: t("quantity"),
      align: "end",
      accessor: (row) => formatQuantity(row.quantity, { unit: unit?.symbol }),
    },
    {
      id: "reserved",
      header: t("reservedQuantity"),
      align: "end",
      accessor: (row) => formatQuantity(row.reservedQuantity, { unit: unit?.symbol }),
    },
  ];

  return (
    <div>
      <Link href="/inventory/products" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToProducts")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {data.sku}
            {data.barcode ? ` · ${data.barcode}` : ""}
          </p>
        </div>
        <Badge variant={data.status === "ACTIVE" ? "success" : "neutral"}>
          {data.status === "ACTIVE" ? t("statusActive") : t("statusArchived")}
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-3xl border border-line bg-paper p-4">
          <p className="text-xs text-muted">{t("costPrice")}</p>
          <p className="mt-1 font-display text-2xl">{formatMoney(data.costPrice)}</p>
        </div>
        <div className="rounded-3xl border border-line bg-paper p-4">
          <p className="text-xs text-muted">{t("sellingPrice")}</p>
          <p className="mt-1 font-display text-2xl">{formatMoney(data.sellingPrice)}</p>
        </div>
        <div className="rounded-3xl border border-line bg-paper p-4">
          <p className="text-xs text-muted">{t("category")}</p>
          <p className="mt-1 font-display text-2xl">{categoryName ?? "—"}</p>
        </div>
        <div className="rounded-3xl border border-line bg-paper p-4">
          <p className="text-xs text-muted">{t("unit")}</p>
          <p className="mt-1 font-display text-2xl">{unit ? `${unit.name} (${unit.symbol})` : "—"}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-2xl">{t("variants")}</h2>
        <div className="mt-3">
          <DataTable
            caption={t("variants")}
            columns={variantColumns}
            data={variants.data ?? []}
            getRowId={(row) => row.id}
            isLoading={variants.isLoading}
            error={variants.isError ? userFacingError(variants.error, tc("error"), tc("forbidden")) : undefined}
            onRetry={() => variants.refetch()}
            emptyTitle={t("noVariants")}
          />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-2xl">{t("stockByWarehouse")}</h2>
        <div className="mt-3">
          <DataTable
            caption={t("stockByWarehouse")}
            columns={stockColumns}
            data={stockLevels.data?.data ?? []}
            getRowId={(row) => row.id}
            isLoading={stockLevels.isLoading}
            error={stockLevels.isError ? userFacingError(stockLevels.error, tc("error"), tc("forbidden")) : undefined}
            onRetry={() => stockLevels.refetch()}
            emptyTitle={t("noStock")}
          />
        </div>
      </div>
    </div>
  );
}
