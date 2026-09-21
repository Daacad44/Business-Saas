"use client";

import type { ProductSummary } from "@daljir/types";
import { createProductSchema, updateProductSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import type { ZodType } from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NumberField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useCategories, useCreateProduct, useUnits, useUpdateProduct } from "@/features/inventory/hooks";

interface ProductFormValues {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  unitId: string;
  costPrice: number;
  sellingPrice: number;
  taxRate: number;
  lowStockThreshold: number | undefined;
  trackStock: boolean;
  hasVariants: boolean;
  status: "ACTIVE" | "ARCHIVED";
}

function defaultsFor(product: ProductSummary | null): ProductFormValues {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    description: "",
    categoryId: product?.categoryId ?? "",
    unitId: product?.unitId ?? "",
    costPrice: product ? Number(product.costPrice) : 0,
    sellingPrice: product ? Number(product.sellingPrice) : 0,
    taxRate: product ? Number(product.taxRate) : 0,
    lowStockThreshold: product?.lowStockThreshold ? Number(product.lowStockThreshold) : undefined,
    trackStock: product?.trackStock ?? true,
    hasVariants: product?.hasVariants ?? false,
    status: product?.status ?? "ACTIVE",
  };
}

export function ProductFormModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductSummary | null;
}) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const categories = useCategories();
  const units = useUnits();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const isEdit = Boolean(product);
  const pending = createProduct.isPending || updateProduct.isPending;

  const form = useForm<ProductFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(
        (isEdit ? updateProductSchema : createProductSchema) as unknown as ZodType<ProductFormValues>,
      ) as Resolver<ProductFormValues>,
    ),
    defaultValues: defaultsFor(product),
  });

  React.useEffect(() => {
    form.reset(defaultsFor(product));
  }, [product, form]);

  async function onSubmit(values: ProductFormValues) {
    const payload = {
      name: values.name,
      sku: values.sku,
      barcode: values.barcode || undefined,
      description: values.description || undefined,
      categoryId: values.categoryId || undefined,
      unitId: values.unitId || undefined,
      costPrice: values.costPrice,
      sellingPrice: values.sellingPrice,
      taxRate: values.taxRate,
      lowStockThreshold: values.lowStockThreshold,
      trackStock: values.trackStock,
      hasVariants: values.hasVariants,
    };
    try {
      if (isEdit && product) {
        await updateProduct.mutateAsync({
          id: product.id,
          input: {
            ...payload,
            categoryId: values.categoryId || null,
            unitId: values.unitId || null,
            barcode: values.barcode || null,
            description: values.description || undefined,
            lowStockThreshold: values.lowStockThreshold ?? null,
            status: values.status,
          },
        });
        toast({ title: t("updated"), variant: "success" });
      } else {
        await createProduct.mutateAsync(payload);
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
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="product-form" disabled={pending || form.formState.isSubmitting}>
            {isEdit ? tc("save") : tc("create")}
          </Button>
        </>
      }
    >
      <form id="product-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
        <TextField
          label={t("name")}
          required
          wrapperClassName="sm:col-span-2"
          {...form.register("name")}
          error={form.formState.errors.name?.message}
        />
        <TextField label={t("sku")} required {...form.register("sku")} error={form.formState.errors.sku?.message} />
        <TextField label={t("barcode")} {...form.register("barcode")} error={form.formState.errors.barcode?.message} />
        <SelectField
          label={t("category")}
          {...form.register("categoryId")}
          error={form.formState.errors.categoryId?.message}
        >
          <option value="">{t("noCategory")}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("unit")} {...form.register("unitId")} error={form.formState.errors.unitId?.message}>
          <option value="">{t("noUnit")}</option>
          {(units.data ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({unit.symbol})
            </option>
          ))}
        </SelectField>
        <NumberField
          label={t("costPrice")}
          kind="money"
          {...form.register("costPrice", { valueAsNumber: true })}
          error={form.formState.errors.costPrice?.message}
        />
        <NumberField
          label={t("sellingPrice")}
          kind="money"
          required
          {...form.register("sellingPrice", { valueAsNumber: true })}
          error={form.formState.errors.sellingPrice?.message}
        />
        <NumberField
          label={t("taxRate")}
          kind="quantity"
          {...form.register("taxRate", { valueAsNumber: true })}
          error={form.formState.errors.taxRate?.message}
        />
        <NumberField
          label={t("lowStockThreshold")}
          kind="quantity"
          {...form.register("lowStockThreshold", {
            setValueAs: (value) => (value === "" ? undefined : Number(value)),
          })}
          error={form.formState.errors.lowStockThreshold?.message}
        />
        {isEdit ? (
          <SelectField label={t("status")} {...form.register("status")}>
            <option value="ACTIVE">{t("statusActive")}</option>
            <option value="ARCHIVED">{t("statusArchived")}</option>
          </SelectField>
        ) : null}
        <TextareaField
          label={t("description")}
          wrapperClassName="sm:col-span-2"
          {...form.register("description")}
          error={form.formState.errors.description?.message}
        />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 rounded border-line" {...form.register("trackStock")} />
          {t("trackStock")}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 rounded border-line" {...form.register("hasVariants")} />
          {t("hasVariants")}
        </label>
      </form>
    </Modal>
  );
}
