"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { isPositiveDecimal, userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useProducts, useWarehouses } from "@/features/inventory/hooks";
import { usePurchase, useSupplier } from "@/features/purchases/hooks";
import type { PurchaseItemSummary } from "@daljir/types";
import { PurchaseStatusBadge } from "./status-badges";

export function PurchaseDetailPage({ purchaseId }: { purchaseId: string }) {
  const t = useTranslations("purchases");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("purchases.create");

  const purchase = usePurchase(purchaseId);
  const supplier = useSupplier(purchase.data?.supplierId ?? "");
  const warehouses = useWarehouses();
  const products = useProducts({ page: 1, pageSize: 100 });

  if (purchase.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
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

  const data = purchase.data;
  const warehouseName =
    (warehouses.data ?? []).find((warehouse) => warehouse.id === data.warehouseId)?.name ?? data.warehouseId;
  const productNameById = new Map(
    (products.data?.data ?? []).map((product) => [product.id, `${product.name} (${product.sku})`]),
  );
  const canPay = canCreate && isPositiveDecimal(data.amountDue);
  const canReturn = canCreate && data.status !== "CANCELLED";

  const columns: DataTableColumn<PurchaseItemSummary>[] = [
    {
      id: "product",
      header: t("product"),
      accessor: (row) => productNameById.get(row.productId) ?? row.productId,
    },
    { id: "quantity", header: t("quantity"), align: "end", accessor: (row) => formatQuantity(row.quantity) },
    { id: "unitCost", header: t("unitCost"), align: "end", accessor: (row) => formatMoney(row.unitCost) },
    { id: "totalCost", header: t("lineTotal"), align: "end", accessor: (row) => formatMoney(row.totalCost) },
  ];

  return (
    <div>
      <Link href="/purchases" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToPurchases")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.purchaseNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {supplier.data?.name ?? data.supplierId} · {warehouseName} · {formatDateTime(data.receivedAt)}
          </p>
        </div>
        <PurchaseStatusBadge status={data.status} label={t(`statusValue.${data.status}`)} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("subtotal")} value={formatMoney(data.subtotal)} />
        <StatCard label={t("total")} value={formatMoney(data.totalAmount)} />
        <StatCard label={t("amountPaid")} value={formatMoney(data.amountPaid)} />
        <StatCard label={t("amountDue")} value={formatMoney(data.amountDue)} />
      </div>

      {data.purchaseOrderId ? (
        <p className="mt-4 text-sm text-muted">
          {t("purchaseOrder")}:{" "}
          <Link href={`/purchase-orders/${data.purchaseOrderId}`} className="text-ink hover:underline">
            {data.purchaseOrderId.slice(0, 8)}
          </Link>
        </p>
      ) : null}
      {data.notes ? <p className="mt-2 text-sm text-muted">{data.notes}</p> : null}

      {canCreate ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {canPay ? (
            <Link
              href={`/payments/new?supplierId=${data.supplierId}&purchaseId=${data.id}`}
              className="inline-flex h-9 items-center rounded-full bg-teal px-3 text-xs font-semibold text-paper hover:bg-teal-dark"
            >
              {t("recordPayment")}
            </Link>
          ) : null}
          {canReturn ? (
            <Link
              href={`/purchases/${data.id}/return`}
              className="inline-flex h-9 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink hover:border-ink"
            >
              {t("createReturn")}
            </Link>
          ) : null}
        </div>
      ) : null}

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
