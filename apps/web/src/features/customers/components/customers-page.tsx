"use client";

import type { CustomerSummary } from "@daljir/types";
import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { SelectField } from "@/components/ui/form-field";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api-errors";
import { useHasPermission } from "@/lib/permissions";
import { useCustomers } from "@/features/customers/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import { CustomerFormModal } from "./customer-form-modal";

interface Filters {
  type: string;
  status: string;
  [key: string]: string;
}

export function CustomersPage() {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("customers.create");

  const { state, setPage, setPageSize, setSearch, setFilter, toggleSort } = useListState<Filters>(
    { type: "", status: "" },
    "createdAt",
  );

  const customers = useCustomers({
    page: state.page,
    pageSize: state.pageSize,
    search: state.search || undefined,
    type: state.filters.type || undefined,
    status: state.filters.status || undefined,
    sortBy: state.sortBy,
    sortOrder: state.sortDirection,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingCustomer, setEditingCustomer] = React.useState<CustomerSummary | null>(null);

  function openCreate() {
    setEditingCustomer(null);
    setFormOpen(true);
  }

  function openEdit(customer: CustomerSummary) {
    setEditingCustomer(customer);
    setFormOpen(true);
  }

  const columns: DataTableColumn<CustomerSummary>[] = [
    {
      id: "fullName",
      header: t("fullName"),
      sortable: true,
      accessor: (row) => (
        <Link href={`/customers/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.fullName}
        </Link>
      ),
    },
    { id: "phone", header: t("phone"), accessor: (row) => row.phone ?? "—" },
    { id: "type", header: t("type"), accessor: (row) => (row.type === "BUSINESS" ? t("typeBusiness") : t("typeIndividual")) },
    {
      id: "currentBalance",
      header: t("currentBalance"),
      sortable: true,
      align: "end",
      accessor: (row) => formatMoney(row.currentBalance),
    },
    {
      id: "creditLimit",
      header: t("creditLimit"),
      sortable: true,
      align: "end",
      accessor: (row) => formatMoney(row.creditLimit),
    },
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? <Button onClick={openCreate}>{t("addCustomer")}</Button> : null}
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
          label={t("type")}
          wrapperClassName="w-44"
          value={state.filters.type}
          onChange={(event) => setFilter("type", event.target.value)}
        >
          <option value="">{t("allTypes")}</option>
          <option value="INDIVIDUAL">{t("typeIndividual")}</option>
          <option value="BUSINESS">{t("typeBusiness")}</option>
        </SelectField>
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
          data={customers.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={customers.isLoading}
          error={customers.isError ? errorMessage(customers.error, tc("error")) : undefined}
          onRetry={() => customers.refetch()}
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

      {customers.data ? (
        <Pagination
          className="mt-4"
          page={customers.data.meta.page}
          pageSize={customers.data.meta.pageSize}
          totalItems={customers.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editingCustomer} />
    </div>
  );
}
