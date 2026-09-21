"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useProducts } from "@/features/inventory/hooks";
import { usePurchaseReturn, useSupplier } from "@/features/purchases/hooks";
import type { PurchaseReturnItemSummary } from "@daljir/types";
import { PurchaseReturnStatusBadge } from "./status-badges";

export function PurchaseReturnDetailPage({ returnId }: { returnId: string }) {
  const t = useTranslations("purchaseReturns");
  const tc = useTranslations("common");

  const purchaseReturn = usePurchaseReturn(returnId);
  const supplier = useSupplier(purchaseReturn.data?.supplierId ?? "");
  const products = useProducts({ page: 1, pageSize: 100 });

  if (purchaseReturn.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (purchaseReturn.isError || !purchaseReturn.data) {
    return (
      <ErrorState
        description={userFacingError(purchaseReturn.error, tc("error"), tc("forbidden"))}
        onRetry={() => purchaseReturn.refetch()}
      />
    );
  }

  const data = purchaseReturn.data;
  const productNameById = new Map(
    (products.data?.data ?? []).map((product) => [product.id, `${product.name} (${product.sku})`]),
  );

  const columns: DataTableColumn<PurchaseReturnItemSummary>[] = [
    {
      id: "product",
      header: t("product"),
      accessor: (row) => productNameById.get(row.productId) ?? row.productId,
    },
    { id: "quantity", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "unitCost", header: t("unitCost"), align: "end", accessor: (row) => formatMoney(row.unitCost) },
    { id: "totalAmount", header: t("lineTotal"), align: "end", accessor: (row) => formatMoney(row.totalAmount) },
  ];

  return (
    <div>
      <Link href="/purchases/returns" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToReturns")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.returnNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {supplier.data?.name ?? data.supplierId} · {formatDateTime(data.returnedAt)}
          </p>
        </div>
        <PurchaseReturnStatusBadge status={data.status} label={t(`statusValue.${data.status}`)} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard label={t("total")} value={formatMoney(data.totalAmount)} />
        <StatCard
          label={t("purchase")}
          value={
            <Link href={`/purchases/${data.purchaseId}`} className="hover:underline">
              {data.purchaseId.slice(0, 8)}
            </Link>
          }
        />
      </div>

      {data.reason ? <p className="mt-4 text-sm text-muted">{data.reason}</p> : null}

      <div className="mt-8">
        <DataTable
          caption={t("items")}
          columns={columns}
          data={data.items ?? []}
          getRowId={(row) => row.id}
          emptyTitle={t("noItems")}
        />
      </div>
    </div>
  );
}
