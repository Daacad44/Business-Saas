"use client";

import type { CategorySummary } from "@daljir/types";
import { createCategorySchema, updateCategorySchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import type { ZodType } from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { errorMessage, fieldErrorsFrom } from "@/lib/api-errors";
import { useHasPermission } from "@/lib/permissions";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/features/inventory/hooks";

interface CategoryFormValues {
  name: string;
  parentId: string;
  description: string;
}

function buildTree(categories: CategorySummary[]) {
  const byParent = new Map<string | null, CategorySummary[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(category);
    byParent.set(key, bucket);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  }
  return byParent;
}

function CategoryFormModal({
  open,
  onClose,
  category,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  category: CategorySummary | null;
  categories: CategorySummary[];
}) {
  const t = useTranslations("categories");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const isEdit = Boolean(category);
  const pending = createCategory.isPending || updateCategory.isPending;

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(
      (isEdit ? updateCategorySchema : createCategorySchema) as unknown as ZodType<CategoryFormValues>,
    ) as Resolver<CategoryFormValues>,
    defaultValues: {
      name: category?.name ?? "",
      parentId: category?.parentId ?? "",
      description: category?.description ?? "",
    },
  });

  React.useEffect(() => {
    form.reset({
      name: category?.name ?? "",
      parentId: category?.parentId ?? "",
      description: category?.description ?? "",
    });
  }, [category, form]);

  const parentOptions = categories.filter((option) => option.id !== category?.id);

  async function onSubmit(values: CategoryFormValues) {
    const payload = {
      name: values.name,
      parentId: values.parentId || undefined,
      description: values.description || undefined,
    };
    try {
      if (isEdit && category) {
        await updateCategory.mutateAsync({
          id: category.id,
          input: { ...payload, parentId: values.parentId || null, description: values.description || null },
        });
        toast({ title: t("updated"), variant: "success" });
      } else {
        await createCategory.mutateAsync(payload);
        toast({ title: t("created"), variant: "success" });
      }
      onClose();
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error);
      for (const [field, message] of Object.entries(fieldErrors)) {
        form.setError(field as keyof CategoryFormValues, { message });
      }
      if (Object.keys(fieldErrors).length === 0) {
        form.setError("parentId", { message: errorMessage(error, tc("error")) });
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
          <Button type="submit" form="category-form" disabled={pending}>
            {isEdit ? tc("save") : tc("create")}
          </Button>
        </>
      }
    >
      <form id="category-form" className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <TextField
          label={t("name")}
          required
          {...form.register("name")}
          error={form.formState.errors.name?.message}
        />
        <SelectField
          label={t("parent")}
          {...form.register("parentId")}
          error={form.formState.errors.parentId?.message}
        >
          <option value="">{t("noParent")}</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label={t("description")}
          {...form.register("description")}
          error={form.formState.errors.description?.message}
        />
      </form>
    </Modal>
  );
}

function CategoryNode({
  category,
  depth,
  childrenByParent,
  canManage,
  onEdit,
  onDelete,
}: {
  category: CategorySummary;
  depth: number;
  childrenByParent: Map<string | null, CategorySummary[]>;
  canManage: boolean;
  onEdit: (category: CategorySummary) => void;
  onDelete: (category: CategorySummary) => void;
}) {
  const tc = useTranslations("common");
  const children = childrenByParent.get(category.id) ?? [];
  return (
    <li>
      <div
        className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"
        style={{ paddingLeft: depth * 24 }}
      >
        <div>
          <p className="font-semibold text-ink">{category.name}</p>
          {category.description ? <p className="text-xs text-muted">{category.description}</p> : null}
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => onEdit(category)}>
              {tc("edit")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(category)}>
              {tc("delete")}
            </Button>
          </div>
        ) : null}
      </div>
      {children.length > 0 ? (
        <ul>
          {children.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              canManage={canManage}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CategoriesPage() {
  const t = useTranslations("categories");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canCreate = useHasPermission("inventory.create");

  const categories = useCategories();
  const deleteCategory = useDeleteCategory();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<CategorySummary | null>(null);
  const [deletingCategory, setDeletingCategory] = React.useState<CategorySummary | null>(null);
  const [deleteError, setDeleteError] = React.useState<string>();

  function openCreate() {
    setEditingCategory(null);
    setFormOpen(true);
  }

  function openEdit(category: CategorySummary) {
    setEditingCategory(category);
    setFormOpen(true);
  }

  function openDelete(category: CategorySummary) {
    setDeleteError(undefined);
    setDeletingCategory(category);
  }

  async function confirmDelete() {
    if (!deletingCategory) return;
    try {
      await deleteCategory.mutateAsync(deletingCategory.id);
      toast({ title: t("deleted"), variant: "success" });
      setDeletingCategory(null);
    } catch (error) {
      setDeleteError(errorMessage(error, tc("error")));
    }
  }

  const data = categories.data ?? [];
  const tree = buildTree(data);
  const roots = tree.get(null) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">{t("title")}</h1>
        {canCreate ? <Button onClick={openCreate}>{t("addCategory")}</Button> : null}
      </div>

      <div className="mt-6 rounded-3xl border border-line bg-paper p-2">
        {categories.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-full max-w-64" />
            ))}
          </div>
        ) : categories.isError ? (
          <ErrorState
            description={errorMessage(categories.error, tc("error"))}
            onRetry={() => categories.refetch()}
          />
        ) : roots.length === 0 ? (
          <EmptyState title={t("empty")} description={t("emptyDescription")} />
        ) : (
          <ul className="px-4">
            {roots.map((category) => (
              <CategoryNode
                key={category.id}
                category={category}
                depth={0}
                childrenByParent={tree}
                canManage={canCreate}
                onEdit={openEdit}
                onDelete={openDelete}
              />
            ))}
          </ul>
        )}
      </div>

      <CategoryFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        category={editingCategory}
        categories={data}
      />

      <ConfirmDialog
        open={Boolean(deletingCategory)}
        onClose={() => setDeletingCategory(null)}
        onConfirm={confirmDelete}
        title={t("deleteTitle")}
        description={deleteError ?? t("deleteBody", { name: deletingCategory?.name ?? "" })}
        destructive
        pending={deleteCategory.isPending}
      />
    </div>
  );
}
