"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/form";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<unknown[]>("/branches") });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<unknown[]>("/warehouses") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<unknown[]>("/users") });

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-copper">{t("title")}</p>
      <h1 className="mt-2 font-display text-4xl">{t("hello", { name: session.data?.user.fullName ?? "" })}</h1>
      <p className="mt-3 max-w-2xl text-muted">{t("empty")}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">{t("branches")}</p>
          <p className="mt-2 font-display text-4xl">{branches.data?.length ?? "—"}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{t("warehouses")}</p>
          <p className="mt-2 font-display text-4xl">{warehouses.data?.length ?? "—"}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">{t("members")}</p>
          <p className="mt-2 font-display text-4xl">{users.data?.length ?? "—"}</p>
        </Card>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/settings/team"
          className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
        >
          {t("ctaTeam")}
        </Link>
        <Link
          href="/settings/locations"
          className="inline-flex h-11 items-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink hover:border-ink"
        >
          {t("ctaLocations")}
        </Link>
      </div>
    </div>
  );
}
