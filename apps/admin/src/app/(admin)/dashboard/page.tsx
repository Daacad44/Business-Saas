"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Building2, Users, GitBranch, Warehouse, FileText, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/form";
import { api } from "@/lib/api";

type OverviewData = {
  businessCount: number;
  userCount: number;
  branchCount: number;
  warehouseCount: number;
  auditLogCount: number;
};

export default function AdminDashboardPage() {
  const { data, isLoading, isError } = useQuery<OverviewData>({
    queryKey: ["admin-overview"],
    queryFn: () => api<OverviewData>("/admin/overview"),
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">
          Platform Overview
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
          System Summary & Metrics
        </h1>
        <p className="mt-1 text-sm text-muted">
          Real-time counts and health across all tenants.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse h-28 bg-paper/50" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load platform metrics. Please check API connectivity.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal/10 text-teal">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted uppercase font-medium">Businesses</p>
              <p className="font-display text-3xl font-bold text-ink">{data?.businessCount ?? 0}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-copper/10 text-copper">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted uppercase font-medium">Platform Users</p>
              <p className="font-display text-3xl font-bold text-ink">{data?.userCount ?? 0}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal/10 text-teal">
              <GitBranch className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted uppercase font-medium">Total Branches</p>
              <p className="font-display text-3xl font-bold text-ink">{data?.branchCount ?? 0}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-copper/10 text-copper">
              <Warehouse className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted uppercase font-medium">Total Warehouses</p>
              <p className="font-display text-3xl font-bold text-ink">{data?.warehouseCount ?? 0}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Quick Navigation Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Link href="/businesses" className="group">
          <Card className="h-full hover:border-teal transition cursor-pointer">
            <div className="flex items-center justify-between">
              <Building2 className="h-6 w-6 text-teal" />
              <ArrowRight className="h-4 w-4 text-muted group-hover:translate-x-1 transition" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Manage Businesses</h3>
            <p className="mt-1 text-xs text-muted">
              Inspect registered tenants, active memberships, locations, and onboarding status.
            </p>
          </Card>
        </Link>

        <Link href="/users" className="group">
          <Card className="h-full hover:border-teal transition cursor-pointer">
            <div className="flex items-center justify-between">
              <Users className="h-6 w-6 text-copper" />
              <ArrowRight className="h-4 w-4 text-muted group-hover:translate-x-1 transition" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">Platform Users</h3>
            <p className="mt-1 text-xs text-muted">
              Inspect user accounts, verify platform administrative roles, and monitor login activity.
            </p>
          </Card>
        </Link>

        <Link href="/system" className="group">
          <Card className="h-full hover:border-teal transition cursor-pointer">
            <div className="flex items-center justify-between">
              <FileText className="h-6 w-6 text-teal" />
              <ArrowRight className="h-4 w-4 text-muted group-hover:translate-x-1 transition" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">System Health & Audits</h3>
            <p className="mt-1 text-xs text-muted">
              Monitor PostgreSQL database latency, Node.js memory footprint, and immutable audit logs.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
