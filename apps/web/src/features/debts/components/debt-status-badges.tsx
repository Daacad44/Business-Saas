"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  classifyDebtCalendar,
  isDebtSettlementStatus,
  type DebtCalendarInput,
  type DebtSettlementStatus,
} from "@/features/debts/calendar";

const SETTLEMENT_VARIANT: Record<DebtSettlementStatus, "neutral" | "info" | "success"> = {
  PENDING: "neutral",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "neutral",
};

export function DebtStatusBadges({
  status,
  dueDate,
  outstandingAmount,
  timeZone,
  asOf,
}: DebtCalendarInput & { timeZone?: string; asOf?: Date }) {
  const t = useTranslations("debts");
  const calendar = timeZone
    ? classifyDebtCalendar({ status, dueDate, outstandingAmount }, asOf ?? new Date(), timeZone)
    : null;
  const settlement = isDebtSettlementStatus(status) ? status : null;

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1">
      {settlement ? <Badge variant={SETTLEMENT_VARIANT[settlement]}>{t(`status.${settlement}`)}</Badge> : null}
      {calendar === "OVERDUE" ? <Badge variant="danger">{t("status.OVERDUE")}</Badge> : null}
      {calendar === "DUE_TODAY" ? <Badge variant="warning">{t("status.DUE_TODAY")}</Badge> : null}
    </span>
  );
}
