"use client";

import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useProducts, useWarehouses } from "@/features/inventory/hooks";
import { useApprovePurchaseOrder, useCancelPurchaseOrder, usePurchaseOrder, useSupplier } from "@/features/purchases/hooks";
import type { PurchaseOrderItemSummary } from "@daljir/types";
import { PurchaseOrderStatusBadge } from "./status-badges";

export function PurchaseOrderDetailPage({ orderId }: { orderId: string }) {
  const t = useTranslations("purchaseOrders");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCreate = useHasPermission("purchases.create");

  const order = usePurchaseOrder(orderId);
  const supplier = useSupplier(order.data?.supplierId ?? "");
  const warehouses = useWarehouses();
  const products = useProducts({ page: 1, pageSize: 100 });
  const approveOrder = useApprovePurchaseOrder();
  const cancelOrder = useCancelPurchaseOrder();

  const [approveOpen, setApproveOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string>();

  async function confirmApprove() {
    try {
      await approveOrder.mutateAsync(orderId);
      toast({ title: t("approved"), variant: "success" });
      setApproveOpen(false);
    } catch (error) {
      setActionError(userFacingError(error, tc("error"), tc("forbidden")));
    }
  }

  async function confirmCancel() {
    try {
      await cancelOrder.mutateAsync(orderId);
      toast({ title: t("cancelled"), variant: "success" });
      setCancelOpen(false);
    } catch (error) {
      setActionError(userFacingError(error, tc("error"), tc("forbidden")));
    }
  }

  if (order.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <ErrorState
        description={userFacingError(order.error, tc("error"), tc("forbidden"))}
        onRetry={() => order.refetch()}
      />
    );
  }

  const data = order.data;
  const warehouseName = (warehouses.data ?? []).find((warehouse) => warehouse.id === data.warehouseId)?.name ?? data.warehouseId;
  const productNameById = new Map((products.data?.data ?? []).map((product) => [product.id, `${product.name} (${product.sku})`]));
  const canApprove = canCreate && data.status === "DRAFT";
  const canCancel = canCreate && (data.status === "DRAFT" || data.status === "SENT");
  const canReceive = canCreate && (data.status === "SENT" || data.status === "PARTIALLY_RECEIVED");

  const columns: DataTableColumn<PurchaseOrderItemSummary>[] = [
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
      <Link href="/purchase-orders" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToOrders")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted">
            {supplier.data?.name ?? data.supplierId} · {warehouseName}
          </p>
        </div>
        <PurchaseOrderStatusBadge status={data.status} label={t(`statusValue.${data.status}`)} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("subtotal")} value={formatMoney(data.subtotal)} />
        <StatCard label={t("tax")} value={formatMoney(data.taxAmount)} />
        <StatCard label={t("total")} value={formatMoney(data.totalAmount)} />
      </div>

      <p className="mt-4 text-sm text-muted">
        {t("expectedAt")}: {data.expectedAt ? formatDate(data.expectedAt) : "—"}
      </p>
      {data.notes ? <p className="mt-2 text-sm text-muted">{data.notes}</p> : null}

      {canCreate ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {canApprove ? (
            <Button
              size="sm"
              onClick={() => {
                setActionError(undefined);
                setApproveOpen(true);
              }}
            >
              {t("approve")}
            </Button>
          ) : null}
          {canReceive ? (
            <Link
              href={`/purchases/new?purchaseOrderId=${data.id}`}
              className="inline-flex h-9 items-center rounded-full bg-teal px-3 text-xs font-semibold text-paper hover:bg-teal-dark"
            >
              {t("receive")}
            </Link>
          ) : null}
          {canCancel ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setActionError(undefined);
                setCancelOpen(true);
              }}
            >
              {t("cancel")}
            </Button>
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

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={confirmApprove}
        title={t("approveTitle")}
        description={actionError ?? t("approveBody")}
        pending={approveOrder.isPending}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
        title={t("cancelTitle")}
        description={actionError ?? t("cancelBody")}
        destructive
        pending={cancelOrder.isPending}
      />
    </div>
  );
}
