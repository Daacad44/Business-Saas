"use client";

import { createStockTransferSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/form";
import { NumberField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api-errors";
import { useCreateStockTransfer, useProducts, useWarehouses } from "@/features/inventory/hooks";

interface TransferFormValues {
  fromWarehouseId: string;
  toWarehouseId: string;
  reference: string;
  notes: string;
  items: { productId: string; quantity: number }[];
}

export function StockTransferFormPage() {
  const t = useTranslations("stockTransfers");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();

  const warehouses = useWarehouses();
  const products = useProducts({ page: 1, pageSize: 100 });
  const createTransfer = useCreateStockTransfer();

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(createStockTransferSchema) as unknown as Resolver<TransferFormValues>,
    defaultValues: {
      fromWarehouseId: "",
      toWarehouseId: "",
      reference: "",
      notes: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });

  const itemsArray = useFieldArray({ control: form.control, name: "items" });

  async function onSubmit(values: TransferFormValues) {
    if (values.fromWarehouseId === values.toWarehouseId) {
      form.setError("toWarehouseId", { message: t("sameWarehouseError") });
      return;
    }
    try {
      await createTransfer.mutateAsync({
        fromWarehouseId: values.fromWarehouseId,
        toWarehouseId: values.toWarehouseId,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
        items: values.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      });
      toast({ title: t("dispatched"), variant: "success" });
      router.push("/inventory/stock-transfers");
    } catch (error) {
      toast({ title: errorMessage(error, tc("error")), variant: "error" });
    }
  }

  return (
    <div>
      <Link
        href="/inventory/stock-transfers"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToTransfers")}
      </Link>

      <h1 className="mt-4 font-display text-4xl">{t("newTransfer")}</h1>

      <form className="mt-6 space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("fromWarehouse")}
            required
            {...form.register("fromWarehouseId")}
            error={form.formState.errors.fromWarehouseId?.message}
          >
            <option value="">{t("selectWarehouse")}</option>
            {(warehouses.data ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("toWarehouse")}
            required
            {...form.register("toWarehouseId")}
            error={form.formState.errors.toWarehouseId?.message}
          >
            <option value="">{t("selectWarehouse")}</option>
            {(warehouses.data ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </SelectField>
          <TextField label={t("reference")} {...form.register("reference")} />
          <TextareaField label={t("notes")} wrapperClassName="sm:col-span-2" {...form.register("notes")} />
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">{t("items")}</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => itemsArray.append({ productId: "", quantity: 1 })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addItem")}
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {itemsArray.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-[2fr_1fr_auto]">
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
            href="/inventory/stock-transfers"
            className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-ink"
          >
            {tc("cancel")}
          </Link>
          <Button type="submit" disabled={createTransfer.isPending}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
