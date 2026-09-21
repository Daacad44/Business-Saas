"use client";

import { createPurchaseOrderSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { DateField, NumberField, SelectField, TextareaField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useProducts, useWarehouses } from "@/features/inventory/hooks";
import { useCreatePurchaseOrder, useSuppliers } from "@/features/purchases/hooks";

interface OrderFormValues {
  supplierId: string;
  warehouseId: string;
  expectedAt: string;
  notes: string;
  items: { productId: string; quantity: number; unitCost: number }[];
}

export function PurchaseOrderFormPage() {
  const t = useTranslations("purchaseOrders");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();

  const suppliers = useSuppliers({ page: 1, pageSize: 100, status: "ACTIVE" });
  const warehouses = useWarehouses();
  const products = useProducts({ page: 1, pageSize: 100 });
  const createOrder = useCreatePurchaseOrder();

  const form = useForm<OrderFormValues>({
    resolver: withBlankAsUndefined(zodResolver(createPurchaseOrderSchema) as unknown as Resolver<OrderFormValues>),
    defaultValues: {
      supplierId: "",
      warehouseId: "",
      expectedAt: "",
      notes: "",
      items: [{ productId: "", quantity: 1, unitCost: 0 }],
    },
  });

  const itemsArray = useFieldArray({ control: form.control, name: "items" });

  async function onSubmit(values: OrderFormValues) {
    try {
      const created = await createOrder.mutateAsync({
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        expectedAt: values.expectedAt ? new Date(values.expectedAt) : undefined,
        notes: values.notes || undefined,
        items: values.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })),
      });
      toast({ title: t("created"), variant: "success" });
      router.push(`/purchase-orders/${created.id}`);
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
      }
    }
  }

  if (suppliers.isLoading || warehouses.isLoading || products.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (suppliers.isError) {
    return (
      <ErrorState
        description={userFacingError(suppliers.error, tc("error"), tc("forbidden"))}
        onRetry={() => suppliers.refetch()}
      />
    );
  }

  if (warehouses.isError) {
    return (
      <ErrorState
        description={userFacingError(warehouses.error, tc("error"), tc("forbidden"))}
        onRetry={() => warehouses.refetch()}
      />
    );
  }

  if (products.isError) {
    return (
      <ErrorState
        description={userFacingError(products.error, tc("error"), tc("forbidden"))}
        onRetry={() => products.refetch()}
      />
    );
  }

  if ((suppliers.data?.data ?? []).length === 0) {
    return (
      <EmptyState
        title={t("noSuppliers")}
        description={t("noSuppliersDescription")}
        action={
          <Link
            href="/suppliers"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("manageSuppliers")}
          </Link>
        }
      />
    );
  }

  if ((warehouses.data ?? []).length === 0) {
    return (
      <EmptyState
        title={t("noWarehouses")}
        description={t("noWarehousesDescription")}
        action={
          <Link
            href="/settings/locations"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {t("manageLocations")}
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <Link href="/purchase-orders" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToOrders")}
      </Link>

      <h1 className="mt-4 font-display text-4xl">{t("newOrder")}</h1>

      <form className="mt-6 space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("supplier")}
            required
            {...form.register("supplierId")}
            error={form.formState.errors.supplierId?.message}
          >
            <option value="">{t("selectSupplier")}</option>
            {(suppliers.data?.data ?? []).map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("warehouse")}
            required
            {...form.register("warehouseId")}
            error={form.formState.errors.warehouseId?.message}
          >
            <option value="">{t("selectWarehouse")}</option>
            {(warehouses.data ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </SelectField>
          <DateField label={t("expectedAt")} {...form.register("expectedAt")} error={form.formState.errors.expectedAt?.message} />
          <TextareaField label={t("notes")} wrapperClassName="sm:col-span-2" {...form.register("notes")} />
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">{t("items")}</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => itemsArray.append({ productId: "", quantity: 1, unitCost: 0 })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addItem")}
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {itemsArray.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <SelectField
                  label={t("product")}
                  required
                  {...form.register(`items.${index}.productId`)}
                  error={form.formState.errors.items?.[index]?.productId?.message}
                >
                  <option value="">{t("selectProduct")}</option>
                  {(products.data?.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </SelectField>
                <NumberField
                  label={t("quantity")}
                  kind="quantity"
                  required
                  {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                  error={form.formState.errors.items?.[index]?.quantity?.message}
                />
                <NumberField
                  label={t("unitCost")}
                  kind="money"
                  required
                  {...form.register(`items.${index}.unitCost`, { valueAsNumber: true })}
                  error={form.formState.errors.items?.[index]?.unitCost?.message}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={itemsArray.fields.length <= 1}
                    onClick={() => itemsArray.remove(index)}
                    aria-label={t("removeItem")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Link
            href="/purchase-orders"
            className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-ink"
          >
            {tc("cancel")}
          </Link>
          <Button type="submit" disabled={createOrder.isPending || form.formState.isSubmitting}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
