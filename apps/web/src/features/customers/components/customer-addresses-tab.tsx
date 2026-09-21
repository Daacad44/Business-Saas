"use client";

import { createCustomerAddressSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useCreateAddress, useCustomerAddresses, useDeleteAddress } from "@/features/customers/hooks";
import type { CustomerAddressSummary } from "@daljir/types";

interface AddressFormValues {
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  country: string;
  isDefault: boolean;
}

export function CustomerAddressesTab({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const canUpdate = useHasPermission("customers.update");

  const addresses = useCustomerAddresses(customerId);
  const createAddress = useCreateAddress();
  const deleteAddress = useDeleteAddress();

  const [formOpen, setFormOpen] = React.useState(false);
  const [deletingAddress, setDeletingAddress] = React.useState<CustomerAddressSummary | null>(null);

  const form = useForm<AddressFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(createCustomerAddressSchema) as Resolver<AddressFormValues>,
    ),
    defaultValues: { label: "", line1: "", line2: "", city: "", region: "", country: "", isDefault: false },
  });

  async function onSubmit(values: AddressFormValues) {
    try {
      await createAddress.mutateAsync({
        customerId,
        input: {
          label: values.label || undefined,
          line1: values.line1,
          line2: values.line2 || undefined,
          city: values.city || undefined,
          region: values.region || undefined,
          country: values.country || undefined,
          isDefault: values.isDefault,
        },
      });
      toast({ title: t("addressAdded"), variant: "success" });
      setFormOpen(false);
      form.reset();
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
      }
    }
  }

  async function confirmDelete() {
    if (!deletingAddress) return;
    try {
      await deleteAddress.mutateAsync({ customerId, addressId: deletingAddress.id });
      toast({ title: t("addressRemoved"), variant: "success" });
      setDeletingAddress(null);
    } catch (error) {
      toast({ title: userFacingError(error, tc("error"), tc("forbidden")), variant: "error" });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">{t("addresses")}</h3>
        {canUpdate ? (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t("addAddress")}
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        {addresses.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : addresses.isError ? (
          <ErrorState
            description={userFacingError(addresses.error, tc("error"), tc("forbidden"))}
            onRetry={() => addresses.refetch()}
          />
        ) : (addresses.data ?? []).length === 0 ? (
          <EmptyState title={t("noAddresses")} />
        ) : (
          <ul className="space-y-3">
            {(addresses.data ?? []).map((address) => (
              <li key={address.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line p-4">
                <div>
                  <p className="font-semibold text-ink">
                    {address.label ?? t("address")} {address.isDefault ? <Badge variant="info">{t("default")}</Badge> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {[address.line1, address.line2, address.city, address.region, address.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                {canUpdate ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeletingAddress(address)}>
                    {tc("delete")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t("addAddress")}
        preventClose={createAddress.isPending}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)} disabled={createAddress.isPending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form="address-form" disabled={createAddress.isPending || form.formState.isSubmitting}>
              {tc("create")}
            </Button>
          </>
        }
      >
        <form id="address-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <TextField label={t("addressLabel")} {...form.register("label")} />
          <TextField
            label={t("line1")}
            required
            wrapperClassName="sm:col-span-2"
            {...form.register("line1")}
            error={form.formState.errors.line1?.message}
          />
          <TextField label={t("line2")} wrapperClassName="sm:col-span-2" {...form.register("line2")} />
          <TextField label={t("city")} {...form.register("city")} />
          <TextField label={t("region")} {...form.register("region")} />
          <TextField label={t("country")} {...form.register("country")} />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 rounded border-line" {...form.register("isDefault")} />
            {t("setDefault")}
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingAddress)}
        onClose={() => setDeletingAddress(null)}
        onConfirm={confirmDelete}
        title={t("removeAddressTitle")}
        destructive
        pending={deleteAddress.isPending}
      />
    </div>
  );
}
