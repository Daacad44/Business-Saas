"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CircleDollarSign,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney } from "@/lib/format";
import { reportUserFacingError } from "../lib/errors";
import { useDashboard, useLowStockReport, useReceivablesAging } from "../hooks";
import { REPORT_DEFAULT_LIMIT } from "../lib/constants";
import type { DashboardPeriodSummary } from "../types";

function MetricCard({
  label,
  value,
  isLoading,
  isError,
  error,
  onRetry,
  href,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  isLoading: boolean;
  isError: boolean;
  error?: string;
  onRetry: () => void;
  href?: string;
  icon?: ComponentProps<typeof StatCard>["icon"];
}) {
  const t = useTranslations("reports");
  const card = (
    <StatCard
      label={label}
      icon={icon}
      value={
        isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : isError ? (
          <span className="block">
            <span className="sr-only">{error}</span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onRetry();
              }}
              className="text-sm font-semibold text-red-700 underline"
            >
              {t("retryCard")}
            </button>
          </span>
        ) : (
          value
        )
      }
    />
  );

  if (!href) return card;
  return (
    <Link href={href} className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
      {card}
    </Link>
  );
}

function PeriodGrid({
  title,
  headingId,
  summary,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  title: string;
  headingId: string;
  summary: DashboardPeriodSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const t = useTranslations("reports");
  return (
    <section className="mt-8" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-display text-2xl">
        {title}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("revenue")}
          value={formatMoney(summary?.revenue ?? "0.00")}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          href="/reports/sales"
          icon={CircleDollarSign}
        />
        <MetricCard
          label={t("transactions")}
          value={summary?.transactionCount ?? 0}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          href="/reports/sales"
          icon={ShoppingCart}
        />
        <MetricCard
          label={t("grossProfit")}
          value={formatMoney(summary?.grossProfit ?? "0.00")}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          href="/reports/profit"
          icon={TrendingUp}
        />
        <MetricCard
          label={t("cashCollected")}
          value={formatMoney(summary?.cashCollected ?? "0.00")}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          href="/reports/sales"
          icon={Banknote}
        />
      </div>
    </section>
  );
}

export function DashboardPage() {
  const t = useTranslations("reports");
  const td = useTranslations("dashboard");
  const tc = useTranslations("common");

  const dashboard = useDashboard();
  const aging = useReceivablesAging({ page: 1, limit: REPORT_DEFAULT_LIMIT });
  const lowStock = useLowStockReport({ page: 1, limit: 1 });

  const dashError = dashboard.isError
    ? reportUserFacingError(dashboard.error, tc("error"), tc("forbidden"), t("validationError"))
    : undefined;
  const agingError = aging.isError
    ? reportUserFacingError(aging.error, tc("error"), tc("forbidden"), t("validationError"))
    : undefined;
  const lowStockError = lowStock.isError
    ? reportUserFacingError(lowStock.error, tc("error"), tc("forbidden"), t("validationError"))
    : undefined;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-copper">{td("title")}</p>
      <h1 className="mt-2 font-display text-4xl">{t("dashboardHeading")}</h1>
      <p className="mt-3 max-w-2xl text-muted">{t("dashboardIntro")}</p>

      <PeriodGrid
        title={t("today")}
        headingId="period-today"
        summary={dashboard.data?.today}
        isLoading={dashboard.isLoading}
        isError={dashboard.isError}
        error={dashError}
        onRetry={() => dashboard.refetch()}
      />
      <PeriodGrid
        title={t("thisWeek")}
        headingId="period-week"
        summary={dashboard.data?.thisWeek}
        isLoading={dashboard.isLoading}
        isError={dashboard.isError}
        error={dashError}
        onRetry={() => dashboard.refetch()}
      />
      <PeriodGrid
        title={t("thisMonth")}
        headingId="period-month"
        summary={dashboard.data?.thisMonth}
        isLoading={dashboard.isLoading}
        isError={dashboard.isError}
        error={dashError}
        onRetry={() => dashboard.refetch()}
      />

      <section className="mt-8" aria-labelledby="alerts">
        <h2 id="alerts" className="font-display text-2xl">
          {t("attention")}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <MetricCard
            label={t("outstandingReceivables")}
            value={formatMoney(aging.data?.data.totalOutstanding ?? dashboard.data?.outstandingReceivables ?? "0.00")}
            isLoading={aging.isLoading && dashboard.isLoading}
            isError={aging.isError && dashboard.isError}
            error={agingError ?? dashError}
            onRetry={() => {
              void aging.refetch();
              void dashboard.refetch();
            }}
            href="/reports/receivables"
            icon={Receipt}
          />
          <MetricCard
            label={t("lowStockCount")}
            value={lowStock.data?.meta.total ?? dashboard.data?.lowStockCount ?? 0}
            isLoading={lowStock.isLoading && dashboard.isLoading}
            isError={lowStock.isError && dashboard.isError}
            error={lowStockError ?? dashError}
            onRetry={() => {
              void lowStock.refetch();
              void dashboard.refetch();
            }}
            href="/reports/inventory"
            icon={Boxes}
          />
          <MetricCard
            label={t("overdueDebtCount")}
            value={dashboard.data?.overdueDebtCount ?? 0}
            isLoading={dashboard.isLoading}
            isError={dashboard.isError}
            error={dashError}
            onRetry={() => dashboard.refetch()}
            href="/debts"
            icon={AlertTriangle}
          />
        </div>
      </section>
    </div>
  );
}
