"use client";

import type { CustomerSummary } from "@daljir/types";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NumberField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { isNonNegativeDecimal, userFacingError } from "@/lib/form-resolver";
import { useAvailableCredit, useUpdateCreditLimit } from "@/features/customers/hooks";

export function CreditLimitModal({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerSummary;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const credit = useAvailableCredit(customer.id);
  const updateCreditLimit = useUpdateCreditLimit();
  const [value, setValue] = React.useState(customer.creditLimit);
  const [error, setError] = React.useState<string>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (updateCreditLimit.isPending) return;
    setError(undefined);
    const trimmed = value.trim();
    if (!isNonNegativeDecimal(trimmed)) {
      setError(t("invalidCreditLimit"));
      return;
    }
    try {
      await updateCreditLimit.mutateAsync({ id: customer.id, creditLimit: Number(trimmed) });
      toast({ title: t("creditLimitUpdated"), variant: "success" });
      onClose();
    } catch (mutationError) {
      setError(userFacingError(mutationError, tc("error"), tc("forbidden")));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("editCreditLimit")}
      preventClose={updateCreditLimit.isPending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={updateCreditLimit.isPending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="credit-limit-form" disabled={updateCreditLimit.isPending}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="credit-limit-form" className="space-y-4" onSubmit={onSubmit}>
        <div className="rounded-2xl bg-sand p-4 text-sm">
          <p className="flex justify-between">
            <span className="text-muted">{t("currentBalance")}</span>
            <span className="font-semibold">{formatMoney(customer.currentBalance)}</span>
          </p>
          <p className="mt-1 flex justify-between">
            <span className="text-muted">{t("availableCredit")}</span>
            <span className="font-semibold">
              {credit.data ? formatMoney(credit.data.availableCredit) : "—"}
            </span>
          </p>
        </div>
        <NumberField
          label={t("creditLimit")}
          kind="money"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error}
        />
      </form>
    </Modal>
  );
}
