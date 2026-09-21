"use client";

import type { ExpenseSummary } from "@daljir/types";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateField, SelectField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useBranches } from "@/features/inventory/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import { PAYMENT_METHODS } from "@/features/purchases/api";
import { useExpenseCategories, useExpenses, useExpenseTotalsByCategory } from "@/features/purchases/hooks";

interface Filters {
  categoryId: string;
  branchId: string;
  method: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

export function ExpensesPage() {
  const t = useTranslations("expenses");
  const td = useTranslations("debts");
  const tc = useTranslations("common");
  const canCreate = useHasPermission("expenses.create");

  const { state, setPage, setPageSize, setFilter } = useListState<Filters>({
    categoryId: "",
    branchId: "",
    method: "",
    dateFrom: "",
    dateTo: "",
  });

  const categories = useExpenseCategories();
  const branches = useBranches();
  const expenses = useExpenses({
    page: state.page,
    pageSize: state.pageSize,
    categoryId: state.filters.categoryId || undefined,
    branchId: state.filters.branchId || undefined,
    method: state.filters.method || undefined,
    dateFrom: state.filters.dateFrom || undefined,
    dateTo: state.filters.dateTo || undefined,
  });
  const summary = useExpenseTotalsByCategory({
    branchId: state.filters.branchId || undefined,
    dateFrom: state.filters.dateFrom || undefined,
    dateTo: state.filters.dateTo || undefined,
  });

  const categoryNameById = new Map((categories.data ?? []).map((category) => [category.id, category.name]));
  const branchNameById = new Map((branches.data ?? []).map((branch) => [branch.id, branch.name]));

  const columns: DataTableColumn<ExpenseSummary>[] = [
    {
      id: "description",
      header: t("description"),
      accessor: (row) => (
        <Link href={`/expenses/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.description}
        </Link>
      ),
    },
    {
      id: "category",
      header: t("category"),
      accessor: (row) => categoryNameById.get(row.categoryId) ?? row.categoryId,
    },
    {
      id: "branch",
      header: t("branch"),
      accessor: (row) => (row.branchId ? (branchNameById.get(row.branchId) ?? row.branchId) : "—"),
    },
    { id: "expenseDate", header: t("expenseDate"), accessor: (row) => formatDate(row.expenseDate) },
    { id: "amount", header: t("amount"), align: "end", accessor: (row) => formatMoney(row.amount) },
    {
      id: "method",
      header: t("method"),
      accessor: (row) => (row.method ? td(`method.${row.method}`) : "—"),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? (
          <Link
            href="/expenses/new"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("newExpense")}
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        <StatCard
          label={t("totalSpend")}
          value={summary.data ? formatMoney(summary.data.totalAmount ?? "0.00") : "—"}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SelectField
          label={t("category")}
          wrapperClassName="w-52"
          value={state.filters.categoryId}
          onChange={(event) => setFilter("categoryId", event.target.value)}
        >
          <option value="">{t("allCategories")}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("branch")}
          wrapperClassName="w-48"
          value={state.filters.branchId}
          onChange={(event) => setFilter("branchId", event.target.value)}
        >
          <option value="">{t("allBranches")}</option>
          {(branches.data ?? []).map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("method")}
          wrapperClassName="w-44"
          value={state.filters.method}
          onChange={(event) => setFilter("method", event.target.value)}
        >
          <option value="">{t("allMethods")}</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {td(`method.${method}`)}
            </option>
          ))}
        </SelectField>
        <DateField
          label={t("dateFrom")}
          wrapperClassName="w-44"
          value={state.filters.dateFrom}
          onChange={(event) => setFilter("dateFrom", event.target.value)}
        />
        <DateField
          label={t("dateTo")}
          wrapperClassName="w-44"
          value={state.filters.dateTo}
          onChange={(event) => setFilter("dateTo", event.target.value)}
        />
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={expenses.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={expenses.isLoading}
          error={expenses.isError ? userFacingError(expenses.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => expenses.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
        />
      </div>

      {expenses.data ? (
        <Pagination
          className="mt-4"
          page={expenses.data.meta.page}
          pageSize={expenses.data.meta.pageSize}
          totalItems={expenses.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
