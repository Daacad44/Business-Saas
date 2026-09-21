"use client";

import { createSupplierSchema, updateSupplierSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import type { ZodType } from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useCreateSupplier, useUpdateSupplier } from "@/features/purchases/hooks";
import type { SupplierRecord } from "@/features/purchases/api";

interface SupplierFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  contactPerson: string;
  notes: string;
  status: "ACTIVE" | "ARCHIVED";
}

function defaultsFor(supplier: SupplierRecord | null): SupplierFormValues {
  return {
    name: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    contactPerson: supplier?.contactPerson ?? "",
    notes: supplier?.notes ?? "",
    status: supplier?.status ?? "ACTIVE",
  };
}

export function SupplierFormModal({
  open,
  onClose,
  supplier,
}: {
  open: boolean;
  onClose: () => void;
  supplier: SupplierRecord | null;
}) {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const isEdit = Boolean(supplier);
  const pending = createSupplier.isPending || updateSupplier.isPending;

  const form = useForm<SupplierFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(
        (isEdit ? updateSupplierSchema : createSupplierSchema) as unknown as ZodType<SupplierFormValues>,
      ) as Resolver<SupplierFormValues>,
    ),
    defaultValues: defaultsFor(supplier),
  });

  React.useEffect(() => {
    form.reset(defaultsFor(supplier));
  }, [supplier, form]);

  async function onSubmit(values: SupplierFormValues) {
    try {
      if (isEdit && supplier) {
        await updateSupplier.mutateAsync({
          id: supplier.id,
          input: {
            name: values.name,
            phone: values.phone || null,
            email: values.email || null,
            address: values.address || null,
            contactPerson: values.contactPerson || null,
            notes: values.notes || null,
            status: values.status,
          },
        });
        toast({ title: t("updated"), variant: "success" });
      } else {
        await createSupplier.mutateAsync({
          name: values.name,
          phone: values.phone || undefined,
          email: values.email || undefined,
          address: values.address || undefined,
          contactPerson: values.contactPerson || undefined,
          notes: values.notes || undefined,
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
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="supplier-form" disabled={pending || form.formState.isSubmitting}>
            {isEdit ? tc("save") : tc("create")}
          </Button>
        </>
      }
    >
      <form id="supplier-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
        <TextField
          label={t("name")}
          required
          wrapperClassName="sm:col-span-2"
          {...form.register("name")}
          error={form.formState.errors.name?.message}
        />
        <TextField label={t("contactPerson")} {...form.register("contactPerson")} error={form.formState.errors.contactPerson?.message} />
        <TextField label={t("phone")} {...form.register("phone")} error={form.formState.errors.phone?.message} />
        <TextField label={t("email")} type="email" {...form.register("email")} error={form.formState.errors.email?.message} />
        <TextField label={t("address")} wrapperClassName="sm:col-span-2" {...form.register("address")} error={form.formState.errors.address?.message} />
        {isEdit ? (
          <SelectField label={t("status")} {...form.register("status")}>
            <option value="ACTIVE">{t("statusActive")}</option>
            <option value="ARCHIVED">{t("statusArchived")}</option>
          </SelectField>
        ) : null}
        <TextareaField label={t("notes")} wrapperClassName="sm:col-span-2" {...form.register("notes")} />
      </form>
    </Modal>
  );
}
