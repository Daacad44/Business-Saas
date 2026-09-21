"use client";

import type { CustomerSummary } from "@daljir/types";
import { createCustomerSchema, updateCustomerSchema } from "@daljir/validation";
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
import { useCreateCustomer, useUpdateCustomer } from "@/features/customers/hooks";

interface CustomerFormValues {
  type: "INDIVIDUAL" | "BUSINESS";
  fullName: string;
  phone: string;
  email: string;
  address: string;
  creditLimit: number;
  notes: string;
  status: "ACTIVE" | "ARCHIVED";
}

function defaultsFor(customer: CustomerSummary | null): CustomerFormValues {
  return {
    type: customer?.type ?? "INDIVIDUAL",
    fullName: customer?.fullName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    creditLimit: customer ? Number(customer.creditLimit) : 0,
    notes: "",
    status: customer?.status ?? "ACTIVE",
  };
}

export function CustomerFormModal({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerSummary | null;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const isEdit = Boolean(customer);
  const pending = createCustomer.isPending || updateCustomer.isPending;

  const form = useForm<CustomerFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(
        (isEdit ? updateCustomerSchema : createCustomerSchema) as unknown as ZodType<CustomerFormValues>,
      ) as Resolver<CustomerFormValues>,
    ),
    defaultValues: defaultsFor(customer),
  });

  React.useEffect(() => {
    form.reset(defaultsFor(customer));
  }, [customer, form]);

  async function onSubmit(values: CustomerFormValues) {
    const payload = {
      type: values.type,
      fullName: values.fullName,
      phone: values.phone || undefined,
      email: values.email || undefined,
      address: values.address || undefined,
      creditLimit: values.creditLimit,
      notes: values.notes || undefined,
    };
    try {
      if (isEdit && customer) {
        await updateCustomer.mutateAsync({
          id: customer.id,
          input: {
            ...payload,
            phone: values.phone || null,
            email: values.email || null,
            address: values.address || null,
            notes: values.notes || undefined,
            status: values.status,
          },
        });
        toast({ title: t("updated"), variant: "success" });
      } else {
        await createCustomer.mutateAsync(payload);
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
          <Button type="submit" form="customer-form" disabled={pending || form.formState.isSubmitting}>
            {isEdit ? tc("save") : tc("create")}
          </Button>
        </>
      }
    >
      <form id="customer-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
        <TextField
          label={t("fullName")}
          required
          wrapperClassName="sm:col-span-2"
          {...form.register("fullName")}
          error={form.formState.errors.fullName?.message}
        />
        <SelectField label={t("type")} {...form.register("type")}>
          <option value="INDIVIDUAL">{t("typeIndividual")}</option>
          <option value="BUSINESS">{t("typeBusiness")}</option>
        </SelectField>
        <NumberField
          label={t("creditLimit")}
          kind="money"
          {...form.register("creditLimit", { valueAsNumber: true })}
          error={form.formState.errors.creditLimit?.message}
        />
        <TextField label={t("phone")} {...form.register("phone")} error={form.formState.errors.phone?.message} />
        <TextField label={t("email")} type="email" {...form.register("email")} error={form.formState.errors.email?.message} />
        <TextField label={t("address")} wrapperClassName="sm:col-span-2" {...form.register("address")} />
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
