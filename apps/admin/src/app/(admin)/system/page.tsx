"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, GitBranch, Server } from "lucide-react";
import { AdminQueryError } from "@/components/admin-query-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useRedirectOnUnauthenticated } from "@/lib/use-admin-query-guard";

type SystemHealthData = {
  status: "healthy" | "degraded";
  environment: string;
  uptimeSeconds: number;
  database: { connected: boolean; latencyMs: number };
  redis: { connected: boolean; latencyMs: number };
  migrations: {
    appliedCount: number;
    pendingCount: number;
    lastMigration: string | null;
    lastAppliedAt: string | null;
    checkAvailable: boolean;
  };
  system: {
    nodeVersion: string;
    platform: string;
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
};

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${d > 0 ? `${d}d ` : ""}${h}h ${m}m ${s}s`;
}

export default function AdminSystemPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<SystemHealthData>({
    queryKey: ["admin-system-health"],
    queryFn: () => api<SystemHealthData>("/admin/system-health"),
    refetchInterval: 15_000,
  });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">Infrastructure &amp; Diagnostics</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">System Health</h1>
          <p className="mt-1 text-sm text-muted">Live operational telemetry from the Daljir SaaS API and data layer.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Refresh now
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : isError && !isUnauthenticated ? (
        <AdminQueryError error={error} onRetry={() => refetch()} />
      ) : isUnauthenticated || !data ? null : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink">PostgreSQL Database</h3>
                  <p className="text-xs text-muted">Prisma engine connection</p>
                </div>
              </div>
              <Badge variant={data.database.connected ? "success" : "danger"}>
                {data.database.connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-line text-sm">
              <div>
                <p className="text-xs text-muted">Query Latency</p>
                <p className="mt-1 font-mono text-lg font-bold text-ink">{data.database.latencyMs} ms</p>
              </div>
              <div>
                <p className="text-xs text-muted">Environment</p>
                <p className="mt-1 font-mono text-sm font-semibold uppercase text-ink">{data.environment}</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper/10 text-copper">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink">Redis Cache</h3>
                  <p className="text-xs text-muted">RESP liveness ping</p>
                </div>
              </div>
              <Badge variant={data.redis.connected ? "success" : "danger"}>
                {data.redis.connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-line text-sm">
              <div>
                <p className="text-xs text-muted">Ping Latency</p>
                <p className="mt-1 font-mono text-lg font-bold text-ink">{data.redis.latencyMs} ms</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
                  <GitBranch className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink">Database Migrations</h3>
                  <p className="text-xs text-muted">Schema version tracking</p>
                </div>
              </div>
              <Badge variant={data.migrations.pendingCount > 0 ? "warning" : "success"}>
                {data.migrations.pendingCount > 0 ? `${data.migrations.pendingCount} pending` : "Up to date"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-line text-sm">
              <div>
                <p className="text-xs text-muted">Applied</p>
                <p className="mt-1 font-mono text-lg font-bold text-ink">{data.migrations.appliedCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Last applied</p>
                <p className="mt-1 text-xs font-semibold text-ink">
                  {data.migrations.lastAppliedAt ? formatDateTime(data.migrations.lastAppliedAt) : "—"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper/10 text-copper">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink">Node.js Process</h3>
                  <p className="text-xs text-muted">Runtime &amp; memory</p>
                </div>
              </div>
              <span className="text-xs text-muted">Uptime {formatUptime(data.uptimeSeconds)}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-line text-sm">
              <div>
                <p className="text-xs text-muted">Node Version</p>
                <p className="mt-1 font-mono text-xs font-bold text-ink">{data.system.nodeVersion}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Heap Used</p>
                <p className="mt-1 font-mono text-xs font-bold text-ink">{data.system.heapUsedMb} MB</p>
              </div>
              <div>
                <p className="text-xs text-muted">RSS Memory</p>
                <p className="mt-1 font-mono text-xs font-bold text-ink">{data.system.rssMb} MB</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
