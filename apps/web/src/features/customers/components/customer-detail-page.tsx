"use client";

import Link from "next/link";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { useHasPermission } from "@/lib/permissions";
import { useAvailableCredit, useCustomer } from "@/features/customers/hooks";
import { CreditLimitModal } from "./credit-limit-modal";
import { CustomerAddressesTab } from "./customer-addresses-tab";
import { CustomerDebtsTab, CustomerPaymentsTab, CustomerSalesTab } from "./customer-history-tabs";
import { CustomerNotesTab } from "./customer-notes-tab";

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const canUpdate = useHasPermission("customers.update");

  const customer = useCustomer(customerId);
  const credit = useAvailableCredit(customerId);
  const [tab, setTab] = React.useState("addresses");
  const [creditModalOpen, setCreditModalOpen] = React.useState(false);

  if (customer.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (customer.isError || !customer.data) {
    return <ErrorState description={userFacingError(customer.error, tc("error"), tc("forbidden"))} onRetry={() => customer.refetch()} />;
  }

  const data = customer.data;

  return (
    <div>
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("backToCustomers")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{data.fullName}</h1>
          <p className="mt-1 text-sm text-muted">
            {data.phone ?? "—"}
            {data.email ? ` · ${data.email}` : ""}
          </p>
        </div>
        <Badge variant={data.status === "ACTIVE" ? "success" : "neutral"}>
          {data.status === "ACTIVE" ? t("statusActive") : t("statusArchived")}
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("currentBalance")} value={formatMoney(data.currentBalance)} />
        <StatCard label={t("creditLimit")} value={formatMoney(data.creditLimit)} />
        <StatCard
          label={t("availableCredit")}
          value={credit.isLoading ? <Skeleton className="h-8 w-24" /> : credit.data ? formatMoney(credit.data.availableCredit) : "—"}
        />
      </div>

      {canUpdate ? (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => setCreditModalOpen(true)}>
            {t("editCreditLimit")}
          </Button>
        </div>
      ) : null}

      <div className="mt-8">
        <Tabs
          label={t("title")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "addresses", label: t("addresses") },
            { value: "notes", label: t("notes") },
            { value: "sales", label: t("salesHistory") },
            { value: "debts", label: t("debts") },
            { value: "payments", label: t("payments") },
          ]}
        />

        <TabPanel value="addresses" activeValue={tab} className="mt-6">
          <CustomerAddressesTab customerId={customerId} />
        </TabPanel>
        <TabPanel value="notes" activeValue={tab} className="mt-6">
          <CustomerNotesTab customerId={customerId} />
        </TabPanel>
        <TabPanel value="sales" activeValue={tab} className="mt-6">
          <CustomerSalesTab customerId={customerId} />
        </TabPanel>
        <TabPanel value="debts" activeValue={tab} className="mt-6">
          <CustomerDebtsTab customerId={customerId} />
        </TabPanel>
        <TabPanel value="payments" activeValue={tab} className="mt-6">
          <CustomerPaymentsTab customerId={customerId} />
        </TabPanel>
      </div>

      <CreditLimitModal
        key={creditModalOpen ? "open" : "closed"}
        open={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        customer={data}
      />
    </div>
  );
}
