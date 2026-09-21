"use client";

import type { ProductSummary } from "@daljir/types";
import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { SelectField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api-errors";
import { useHasPermission } from "@/lib/permissions";
import { useArchiveProduct, useCategories, useProducts } from "@/features/inventory/hooks";
import { useListState } from "@/features/inventory/lib/list-state";
import { ProductFormModal } from "./product-form-modal";

interface Filters {
  categoryId: string;
  status: string;
  [key: string]: string;
}

export function ProductsPage() {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCreate = useHasPermission("inventory.create");

  const { state, setPage, setPageSize, setSearch, setFilter, toggleSort } = useListState<Filters>(
    { categoryId: "", status: "" },
    "createdAt",
  );

  const categories = useCategories();
  const products = useProducts({
    page: state.page,
    pageSize: state.pageSize,
    search: state.search || undefined,
    categoryId: state.filters.categoryId || undefined,
    status: state.filters.status || undefined,
    sortBy: state.sortBy,
    sortDir: state.sortDirection,
  });
  const archiveProduct = useArchiveProduct();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<ProductSummary | null>(null);
  const [archivingProduct, setArchivingProduct] = React.useState<ProductSummary | null>(null);

  const categoryNameById = new Map((categories.data ?? []).map((category) => [category.id, category.name]));

  function openCreate() {
    setEditingProduct(null);
    setFormOpen(true);
  }

  function openEdit(product: ProductSummary) {
    setEditingProduct(product);
    setFormOpen(true);
  }

  async function confirmArchive() {
    if (!archivingProduct) return;
    try {
      await archiveProduct.mutateAsync(archivingProduct.id);
      toast({ title: t("archived"), variant: "success" });
      setArchivingProduct(null);
    } catch (error) {
      toast({ title: errorMessage(error, tc("error")), variant: "error" });
    }
  }

  const columns: DataTableColumn<ProductSummary>[] = [
    {
      id: "name",
      header: t("name"),
      sortable: true,
      accessor: (row) => (
        <Link href={`/inventory/products/${row.id}`} className="font-semibold text-ink hover:underline">
          {row.name}
        </Link>
      ),
    },
    { id: "sku", header: t("sku"), sortable: true, accessor: (row) => row.sku },
    {
      id: "category",
      header: t("category"),
      accessor: (row) => (row.categoryId ? categoryNameById.get(row.categoryId) ?? "—" : "—"),
    },
    {
      id: "sellingPrice",
      header: t("sellingPrice"),
      sortable: true,
      align: "end",
      accessor: (row) => formatMoney(row.sellingPrice),
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
        {canCreate ? <Button onClick={openCreate}>{t("addProduct")}</Button> : null}
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
          label={t("category")}
          wrapperClassName="w-48"
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
          data={products.data?.data ?? []}
          getRowId={(row) => row.id}
          isLoading={products.isLoading}
          error={products.isError ? errorMessage(products.error, tc("error")) : undefined}
          onRetry={() => products.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
          sortBy={state.sortBy}
          sortDirection={state.sortDirection}
          onSortChange={toggleSort}
          rowActions={
            canCreate
              ? (row) => (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                      {tc("edit")}
                    </Button>
                    {row.status === "ACTIVE" ? (
                      <Button size="sm" variant="ghost" onClick={() => setArchivingProduct(row)}>
                        {t("archive")}
                      </Button>
                    ) : null}
                  </div>
                )
              : undefined
          }
        />
      </div>

      {products.data ? (
        <Pagination
          className="mt-4"
          page={products.data.meta.page}
          pageSize={products.data.meta.pageSize}
          totalItems={products.data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editingProduct} />

      <ConfirmDialog
        open={Boolean(archivingProduct)}
        onClose={() => setArchivingProduct(null)}
        onConfirm={confirmArchive}
        title={t("archiveTitle")}
        description={t("archiveBody", { name: archivingProduct?.name ?? "" })}
        destructive
        pending={archiveProduct.isPending}
      />
    </div>
  );
}
