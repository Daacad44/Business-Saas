"use client";

import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { SelectField } from "@/components/ui/form-field";
import { formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useListState } from "@/features/inventory/lib/list-state";
import { useSuppliers } from "@/features/purchases/hooks";
import type { SupplierRecord } from "@/features/purchases/api";
import { SupplierFormModal } from "./supplier-form-modal";
import { SupplierStatusBadge } from "./status-badges";

interface Filters {
  status: string;
  [key: string]: string;
}

export function SuppliersPage() {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("purchases.create");

  const { state, setPage, setPageSize, setSearch, setFilter, toggleSort } = useListState<Filters>(
    { status: "" },
    "createdAt",
  );

  const suppliers = useSuppliers({
    page: state.page,
    pageSize: state.pageSize,
    search: state.search || undefined,
    status: state.filters.status || undefined,
    sortBy: state.sortBy,
    sortOrder: state.sortDirection,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingSupplier, setEditingSupplier] = React.useState<SupplierRecord | null>(null);

  function openCreate() {
    setEditingSupplier(null);
    setFormOpen(true);
  }

  function openEdit(supplier: SupplierRecord) {
    setEditingSupplier(supplier);
    setFormOpen(true);
  }

  const columns: DataTableColumn<SupplierRecord>[] = [
    {
      id: "name",
      header: t("name"),
      sortable: true,
      accessor: (row) => (
        <Link href={`/suppliers/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.name}
        </Link>
      ),
    },
    { id: "contactPerson", header: t("contactPerson"), accessor: (row) => row.contactPerson ?? "—" },
    { id: "phone", header: t("phone"), accessor: (row) => row.phone ?? "—" },
    { id: "email", header: t("email"), accessor: (row) => row.email ?? "—" },
    {
      id: "currentBalance",
      header: t("currentBalance"),
      sortable: true,
      align: "end",
      accessor: (row) => formatMoney(row.currentBalance),
    },
    {
      id: "status",
      header: t("status"),
      align: "center",
      accessor: (row) => (
        <SupplierStatusBadge
          status={row.status}
          label={row.status === "ACTIVE" ? t("statusActive") : t("statusArchived")}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? <Button onClick={openCreate}>{t("addSupplier")}</Button> : null}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SearchInput
          value={state.search}
          onValueChange={setSearch}
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-sm"
        />
        <SelectField
          label={t("status")}
          wrapperClassName="w-40"
          value={state.filters.status}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="">{t("allStatuses")}</option>
          <option value="ACTIVE">{t("statusActive")}</option>
          <option value="ARCHIVED">{t("statusArchived")}</option>
        </SelectField>
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={suppliers.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={suppliers.isLoading}
          error={suppliers.isError ? userFacingError(suppliers.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => suppliers.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
          sortBy={state.sortBy}
          sortDirection={state.sortDirection}
          onSortChange={toggleSort}
          rowActions={
            canCreate
              ? (row) => (
                  <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                    {tc("edit")}
                  </Button>
                )
              : undefined
          }
        />
      </div>

      {suppliers.data ? (
        <Pagination
          className="mt-4"
          page={suppliers.data.meta.page}
          pageSize={suppliers.data.meta.pageSize}
          totalItems={suppliers.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <SupplierFormModal open={formOpen} onClose={() => setFormOpen(false)} supplier={editingSupplier} />
    </div>
  );
}
