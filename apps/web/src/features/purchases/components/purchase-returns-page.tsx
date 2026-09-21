"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SelectField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useListState } from "@/features/inventory/lib/list-state";
import { usePurchaseReturns, useSuppliers } from "@/features/purchases/hooks";
import type { PurchaseReturnRecord } from "@/features/purchases/api";
import { PurchaseReturnStatusBadge } from "./status-badges";

interface Filters {
  supplierId: string;
  [key: string]: string;
}

export function PurchaseReturnsPage() {
  const t = useTranslations("purchaseReturns");
  const tc = useTranslations("common");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({ supplierId: "" });
  const suppliers = useSuppliers({ page: 1, pageSize: 100 });
  const returns = usePurchaseReturns({
    page: state.page,
    pageSize: state.pageSize,
    supplierId: state.filters.supplierId || undefined,
  });

  const supplierNameById = new Map((suppliers.data?.data ?? []).map((supplier) => [supplier.id, supplier.name]));

  const columns: DataTableColumn<PurchaseReturnRecord>[] = [
    {
      id: "returnNumber",
      header: t("number"),
      accessor: (row) => (
        <Link href={`/purchases/returns/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.returnNumber}
        </Link>
      ),
    },
    {
      id: "supplier",
      header: t("supplier"),
      accessor: (row) => supplierNameById.get(row.supplierId) ?? row.supplierId,
    },
    {
      id: "purchase",
      header: t("purchase"),
      accessor: (row) => (
        <Link href={`/purchases/${row.purchaseId}`} className="text-ink hover:underline">
          {row.purchaseId.slice(0, 8)}
        </Link>
      ),
    },
    { id: "returnedAt", header: t("returnedAt"), accessor: (row) => formatDateTime(row.returnedAt) },
    { id: "totalAmount", header: t("total"), align: "end", accessor: (row) => formatMoney(row.totalAmount) },
    {
      id: "status",
      header: t("status"),
      align: "center",
      accessor: (row) => <PurchaseReturnStatusBadge status={row.status} label={t(`statusValue.${row.status}`)} />,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SelectField
          label={t("supplier")}
          wrapperClassName="w-56"
          value={state.filters.supplierId}
          onChange={(event) => setFilter("supplierId", event.target.value)}
        >
          <option value="">{t("allSuppliers")}</option>
          {(suppliers.data?.data ?? []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={returns.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={returns.isLoading}
          error={returns.isError ? userFacingError(returns.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => returns.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
        />
      </div>

      {returns.data ? (
        <Pagination
          className="mt-4"
          page={returns.data.meta.page}
          pageSize={returns.data.meta.pageSize}
          totalItems={returns.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
