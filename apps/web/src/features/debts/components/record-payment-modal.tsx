"use client";

import { createDebtPaymentSchema } from "@daljir/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NumberField, SelectField, TextareaField, TextField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { applyFieldErrors, userFacingError, withBlankAsUndefined } from "@/lib/form-resolver";
import { useRecordDebtPayment } from "@/features/debts/hooks";

const METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CREDIT_NOTE", "OTHER"] as const;

interface PaymentFormValues {
  amount: number;
  method: (typeof METHODS)[number];
  reference: string;
  notes: string;
}

export function RecordPaymentModal({
  open,
  onClose,
  debtId,
  outstandingAmount,
}: {
  open: boolean;
  onClose: () => void;
  debtId: string;
  outstandingAmount: string;
}) {
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const recordPayment = useRecordDebtPayment();

  const form = useForm<PaymentFormValues>({
    resolver: withBlankAsUndefined(
      zodResolver(createDebtPaymentSchema) as unknown as Resolver<PaymentFormValues>,
    ),
    defaultValues: { amount: 0, method: "CASH", reference: "", notes: "" },
  });

  async function onSubmit(values: PaymentFormValues) {
    try {
      await recordPayment.mutateAsync({
        id: debtId,
        input: {
          amount: values.amount,
          method: values.method,
          reference: values.reference || undefined,
          notes: values.notes || undefined,
        },
      });
      toast({ title: t("paymentRecorded"), variant: "success" });
      form.reset({ amount: 0, method: "CASH", reference: "", notes: "" });
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
      title={t("recordPayment")}
      description={`${t("outstandingAmount")}: ${formatMoney(outstandingAmount)}`}
      preventClose={recordPayment.isPending}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={recordPayment.isPending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="record-payment-form" disabled={recordPayment.isPending || form.formState.isSubmitting}>
            {t("recordPayment")}
          </Button>
        </>
      }
    >
      <form id="record-payment-form" className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <NumberField
          label={t("amount")}
          kind="money"
          required
          {...form.register("amount", { valueAsNumber: true })}
          error={form.formState.errors.amount?.message}
        />
        <SelectField label={t("methodLabel")} {...form.register("method")}>
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {t(`method.${method}`)}
            </option>
          ))}
        </SelectField>
        <TextField label={t("reference")} {...form.register("reference")} />
        <TextareaField label={t("notes")} {...form.register("notes")} />
      </form>
    </Modal>
  );
}
