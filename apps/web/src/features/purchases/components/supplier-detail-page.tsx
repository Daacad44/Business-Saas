"use client";

import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatMoney } from "@/lib/format";
import { isPositiveDecimal, userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useListState } from "@/features/inventory/lib/list-state";
import {
  useDisableSupplier,
  useSupplier,
  useSupplierPayments,
  useSupplierPurchases,
} from "@/features/purchases/hooks";
import type { PurchaseRecord, SupplierPaymentRecord } from "@/features/purchases/api";
import { SupplierFormModal } from "./supplier-form-modal";
import { PurchaseStatusBadge, SupplierStatusBadge } from "./status-badges";

function SupplierPurchasesTab({ supplierId }: { supplierId: string }) {
  const t = useTranslations("suppliers");
  const tp = useTranslations("purchases");
  const tc = useTranslations("common");
  const { state, setPage, setPageSize } = useListState({});
  const purchases = useSupplierPurchases(supplierId, state.page, state.pageSize);

  const columns: DataTableColumn<PurchaseRecord>[] = [
    {
      id: "purchaseNumber",
      header: tp("number"),
      accessor: (row) => (
        <Link href={`/purchases/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.purchaseNumber}
        </Link>
      ),
    },
    { id: "receivedAt", header: tp("receivedAt"), accessor: (row) => formatDateTime(row.receivedAt) },
    { id: "totalAmount", header: tp("total"), align: "end", accessor: (row) => formatMoney(row.totalAmount) },
    { id: "amountDue", header: tp("amountDue"), align: "end", accessor: (row) => formatMoney(row.amountDue) },
    {
      id: "status",
      header: tp("status"),
      align: "center",
      accessor: (row) => <PurchaseStatusBadge status={row.status} label={tp(`statusValue.${row.status}`)} />,
    },
  ];

  return (
    <div>
      <DataTable
        caption={t("purchases")}
        columns={columns}
        data={purchases.data?.data ?? []}
        getRowId={(row) => row.id}
        isLoading={purchases.isLoading}
        error={purchases.isError ? userFacingError(purchases.error, tc("error"), tc("forbidden")) : undefined}
        onRetry={() => purchases.refetch()}
        emptyTitle={t("noPurchases")}
      />
      {purchases.data ? (
        <Pagination
          className="mt-4"
          page={purchases.data.meta.page}
          pageSize={purchases.data.meta.pageSize}
          totalItems={purchases.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}

function SupplierPaymentsTab({ supplierId }: { supplierId: string }) {
  const t = useTranslations("suppliers");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const { state, setPage, setPageSize } = useListState({});
  const payments = useSupplierPayments(supplierId, state.page, state.pageSize);

  const columns: DataTableColumn<SupplierPaymentRecord>[] = [
    { id: "paidAt", header: t("date"), accessor: (row) => formatDateTime(row.paidAt) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    { id: "method", header: t("method"), accessor: (row) => td(`method.${row.method}`) },
    { id: "reference", header: t("reference"), accessor: (row) => row.reference ?? "—" },
    {
      id: "purchaseId",
      header: t("appliedTo"),
      accessor: (row) =>
        row.purchaseId ? (
          <Link href={`/purchases/${row.purchaseId}`} className="text-ink hover:underline">
            {row.purchaseId.slice(0, 8)}
          </Link>
        ) : (
          t("onAccount")
        ),
    },
  ];

  return (
    <div>
      <DataTable
        caption={t("payments")}
        columns={columns}
        data={payments.data?.data ?? []}
        getRowId={(row) => row.id}
        isLoading={payments.isLoading}
        error={payments.isError ? userFacingError(payments.error, tc("error"), tc("forbidden")) : undefined}
        onRetry={() => payments.refetch()}
        emptyTitle={t("noPayments")}
      />
      {payments.data ? (
        <Pagination
          className="mt-4"
          page={payments.data.meta.page}
          pageSize={payments.data.meta.pageSize}
          totalItems={payments.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}

export function SupplierDetailPage({ supplierId }: { supplierId: string }) {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCreate = useHasPermission("purchases.create");
  const supplier = useSupplier(supplierId);
  const disableSupplier = useDisableSupplier();

  const [tab, setTab] = React.useState("purchases");
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string>();

  async function confirmArchive() {
    try {
      await disableSupplier.mutateAsync(supplierId);
      toast({ title: t("archived"), variant: "success" });
      setArchiveOpen(false);
    } catch (error) {
      setArchiveError(userFacingError(error, tc("error"), tc("forbidden")));
    }
  }

  if (supplier.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (supplier.isError || !supplier.data) {
    return (
      <ErrorState
        description={userFacingError(supplier.error, tc("error"), tc("forbidden"))}
        onRetry={() => supplier.refetch()}
      />
    );
  }

  const data = supplier.data;
  const canPay = canCreate && isPositiveDecimal(data.currentBalance);

  return (
    <div>
      <Link href="/suppliers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToSuppliers")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {data.contactPerson ?? "—"}
            {data.phone ? ` · ${data.phone}` : ""}
            {data.email ? ` · ${data.email}` : ""}
          </p>
        </div>
        <SupplierStatusBadge
          status={data.status}
          label={data.status === "ACTIVE" ? t("statusActive") : t("statusArchived")}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard label={t("currentBalance")} value={formatMoney(data.currentBalance)} />
        <StatCard label={t("address")} value={data.address ?? "—"} />
      </div>

      {canCreate ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            {tc("edit")}
          </Button>
          {canPay ? (
            <Link
              href={`/payments/new?supplierId=${data.id}`}
              className="inline-flex h-9 items-center rounded-full bg-teal px-3 text-xs font-semibold text-paper hover:bg-teal-dark"
            >
              {t("recordPayment")}
            </Link>
          ) : null}
          {data.status === "ACTIVE" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setArchiveError(undefined);
                setArchiveOpen(true);
              }}
            >
              {t("archive")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {data.notes ? <p className="mt-4 text-sm text-muted">{data.notes}</p> : null}

      <div className="mt-8">
        <Tabs
          label={t("title")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "purchases", label: t("purchases") },
            { value: "payments", label: t("payments") },
          ]}
        />
        <TabPanel value="purchases" activeValue={tab} className="mt-6">
          <SupplierPurchasesTab supplierId={supplierId} />
        </TabPanel>
        <TabPanel value="payments" activeValue={tab} className="mt-6">
          <SupplierPaymentsTab supplierId={supplierId} />
        </TabPanel>
      </div>

      <SupplierFormModal open={editOpen} onClose={() => setEditOpen(false)} supplier={data} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
        title={t("archiveTitle")}
        description={archiveError ?? t("archiveBody", { name: data.name })}
        destructive
        pending={disableSupplier.isPending}
      />
    </div>
  );
}
