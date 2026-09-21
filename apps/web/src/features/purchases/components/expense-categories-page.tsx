"use client";

import type { ExpenseCategorySummary } from "@daljir/types";
import { createExpenseCategorySchema, updateExpenseCategorySchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import type { ZodType } from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { TextareaField, TextField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import {
  useCreateExpenseCategory,
  useDeleteExpenseCategory,
  useExpenseCategories,
  useUpdateExpenseCategory,
} from "@/features/purchases/hooks";

interface CategoryFormValues {
  name: string;
  description: string;
}

function CategoryFormModal({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  category: ExpenseCategorySummary | null;
}) {
  const t = useTranslations("expenseCategories");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const createCategory = useCreateExpenseCategory();
  const updateCategory = useUpdateExpenseCategory();
  const isEdit = Boolean(category);
  const pending = createCategory.isPending || updateCategory.isPending;

  const form = useForm<CategoryFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(
        (isEdit ? updateExpenseCategorySchema : createExpenseCategorySchema) as unknown as ZodType<CategoryFormValues>,
      ) as Resolver<CategoryFormValues>,
    ),
    defaultValues: { name: category?.name ?? "", description: category?.description ?? "" },
  });

  React.useEffect(() => {
    form.reset({ name: category?.name ?? "", description: category?.description ?? "" });
  }, [category, form]);

  async function onSubmit(values: CategoryFormValues) {
    try {
      if (isEdit && category) {
        await updateCategory.mutateAsync({
          id: category.id,
          input: { name: values.name, description: values.description || null },
        });
        toast({ title: t("updated"), variant: "success" });
      } else {
        await createCategory.mutateAsync({
          name: values.name,
          description: values.description || undefined,
        });
        toast({ title: t("created"), variant: "success" });
      }
      onClose();
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("editTitle") : t("createTitle")}
      preventClose={pending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="expense-category-form" disabled={pending || form.formState.isSubmitting}>
            {isEdit ? tc("save") : tc("create")}
          </Button>
        </>
      }
    >
      <form id="expense-category-form" className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <TextField label={t("name")} required {...form.register("name")} error={form.formState.errors.name?.message} />
        <TextareaField label={t("description")} {...form.register("description")} />
      </form>
    </Modal>
  );
}

export function ExpenseCategoriesPage() {
  const t = useTranslations("expenseCategories");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCreate = useHasPermission("expenses.create");
  const categories = useExpenseCategories();
  const deleteCategory = useDeleteExpenseCategory();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseCategorySummary | null>(null);
  const [deleting, setDeleting] = React.useState<ExpenseCategorySummary | null>(null);
  const [deleteError, setDeleteError] = React.useState<string>();

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteCategory.mutateAsync(deleting.id);
      toast({ title: t("deleted"), variant: "success" });
      setDeleting(null);
    } catch (error) {
      setDeleteError(userFacingError(error, tc("error"), tc("forbidden")));
    }
  }

  const columns: DataTableColumn<ExpenseCategorySummary>[] = [
    { id: "name", header: t("name"), accessor: (row) => row.name },
    { id: "description", header: t("description"), accessor: (row) => row.description ?? "—" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}>{t("addCategory")}</Button> : null}
      </div>

      <div className="mt-6">
        <DataTable
          caption={t("title")}
          columns={columns}
          data={categories.data ?? []}
          getRowId={(row) => row.id}
          isLoading={categories.isLoading}
          error={categories.isError ? userFacingError(categories.error, tc("error"), tc("forbidden")) : undefined}
          onRetry={() => categories.refetch()}
          emptyTitle={t("empty")}
          emptyDescription={t("emptyDescription")}
          rowActions={
            canCreate
              ? (row) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(row);
                        setFormOpen(true);
                      }}
                    >
                      {tc("edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDeleteError(undefined);
                        setDeleting(row);
                      }}
                    >
                      {tc("delete")}
                    </Button>
                  </div>
                )
              : undefined
          }
        />
      </div>

      <CategoryFormModal open={formOpen} onClose={() => setFormOpen(false)} category={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("deleteTitle")}
        description={deleteError ?? t("deleteBody", { name: deleting?.name ?? "" })}
        destructive
        pending={deleteCategory.isPending}
      />
    </div>
  );
}
