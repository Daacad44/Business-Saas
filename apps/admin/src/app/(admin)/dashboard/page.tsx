"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, ArrowRight, Building2, FileText, ShieldCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/form";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { api } from "@/lib/api";
import { useRedirectOnUnauthenticated, apiErrorMessage } from "@/lib/use-admin-query-guard";

type SignupPoint = { date: string; count: number };

type OverviewData = {
  businessCount: number;
  activeBusinessCount: number;
  suspendedBusinessCount: number;
  userCount: number;
  branchCount: number;
  warehouseCount: number;
  auditLogCount: number;
  activeSessionCount: number;
  signupSeries: SignupPoint[];
};

export default function AdminDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<OverviewData>({
    queryKey: ["admin-overview"],
    queryFn: () => api<OverviewData>("/admin/overview"),
  });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);

  const recentSignups = data?.signupSeries.slice(-7) ?? [];
  const maxSignups = Math.max(1, ...recentSignups.map((point) => point.count));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">Platform Overview</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">System Summary &amp; Metrics</h1>
        <p className="mt-1 text-sm text-muted">Real-time counts and health across all tenants.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="h-28">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
            </Card>
          ))}
        </div>
      ) : isError && !isUnauthenticated ? (
        <ErrorState description={apiErrorMessage(error)} onRetry={() => refetch()} />
      ) : isUnauthenticated ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Businesses"
              value={data?.businessCount ?? 0}
              icon={Building2}
              delta={{
                value: `${data?.activeBusinessCount ?? 0} active / ${data?.suspendedBusinessCount ?? 0} suspended`,
                direction: (data?.suspendedBusinessCount ?? 0) > 0 ? "down" : "neutral",
              }}
            />
            <StatCard label="Platform Users" value={data?.userCount ?? 0} icon={Users} />
            <StatCard label="Active Sessions" value={data?.activeSessionCount ?? 0} icon={ShieldCheck} />
            <StatCard label="Audit Log Entries" value={data?.auditLogCount ?? 0} icon={Activity} />
          </div>

          <Card>
            <h3 className="font-display text-lg font-semibold text-ink">Signups — last 7 days</h3>
            {recentSignups.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No new signups in this window.</p>
            ) : (
              <div className="mt-4 flex items-end gap-3">
                {recentSignups.map((point) => (
                  <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-lg bg-teal/70"
                      style={{ height: `${Math.max(6, (point.count / maxSignups) * 96)}px` }}
                      aria-hidden="true"
                    />
                    <p className="text-[10px] text-muted">{point.date.slice(5)}</p>
                    <p className="text-xs font-semibold text-ink">{point.count}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        <Link href="/businesses" className="group">
          <Card className="h-full hover:border-teal transition cursor-pointer">
            <div className="flex items-center justify-between">
              <Building2 className="h-6 w-6 text-teal" />
              <ArrowRight className="h-4 w-4 text-muted group-hover:translate-x-1 transition" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Manage Businesses</h3>
            <p className="mt-1 text-xs text-muted">Suspend, reactivate, and inspect tenant accounts.</p>
          </Card>
        </Link>

        <Link href="/users" className="group">
          <Card className="h-full hover:border-teal transition cursor-pointer">
            <div className="flex items-center justify-between">
              <Users className="h-6 w-6 text-copper" />
              <ArrowRight className="h-4 w-4 text-muted group-hover:translate-x-1 transition" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Platform Users</h3>
            <p className="mt-1 text-xs text-muted">Inspect accounts and manage Super Admin access.</p>
          </Card>
        </Link>

        <Link href="/system" className="group">
          <Card className="h-full hover:border-teal transition cursor-pointer">
            <div className="flex items-center justify-between">
              <Activity className="h-6 w-6 text-teal" />
              <ArrowRight className="h-4 w-4 text-muted group-hover:translate-x-1 transition" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">System Health</h3>
            <p className="mt-1 text-xs text-muted">Live database, cache, and migration diagnostics.</p>
          </Card>
        </Link>

        <Link href="/audit-logs" className="group">
          <Card className="h-full hover:border-teal transition cursor-pointer">
            <div className="flex items-center justify-between">
              <FileText className="h-6 w-6 text-copper" />
              <ArrowRight className="h-4 w-4 text-muted group-hover:translate-x-1 transition" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Audit Logs</h3>
            <p className="mt-1 text-xs text-muted">Filterable, immutable record of sensitive operations.</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
