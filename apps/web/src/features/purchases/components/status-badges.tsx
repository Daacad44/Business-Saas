"use client";

import type { PurchaseOrderStatus, PurchaseReturnStatus, PurchaseStatus, SupplierStatus } from "@daljir/types";
import { Badge } from "@/components/ui/badge";

const SUPPLIER_VARIANT: Record<SupplierStatus, "success" | "neutral"> = {
  ACTIVE: "success",
  ARCHIVED: "neutral",
};

const PO_VARIANT: Record<PurchaseOrderStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CANCELLED: "danger",
};

const PURCHASE_VARIANT: Record<PurchaseStatus, "warning" | "success" | "danger"> = {
  PENDING: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const RETURN_VARIANT: Record<PurchaseReturnStatus, "warning" | "success" | "danger"> = {
  PENDING: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
};

export function SupplierStatusBadge({ status, label }: { status: SupplierStatus; label: string }) {
  return <Badge variant={SUPPLIER_VARIANT[status]}>{label}</Badge>;
}

export function PurchaseOrderStatusBadge({ status, label }: { status: PurchaseOrderStatus; label: string }) {
  return <Badge variant={PO_VARIANT[status]}>{label}</Badge>;
}

export function PurchaseStatusBadge({ status, label }: { status: PurchaseStatus; label: string }) {
  return <Badge variant={PURCHASE_VARIANT[status]}>{label}</Badge>;
}

export function PurchaseReturnStatusBadge({ status, label }: { status: PurchaseReturnStatus; label: string }) {
  return <Badge variant={RETURN_VARIANT[status]}>{label}</Badge>;
}
