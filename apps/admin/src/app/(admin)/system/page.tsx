"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, Server, Clock } from "lucide-react";
import { Card } from "@/components/ui/form";
import { api } from "@/lib/api";

type SystemHealthData = {
  status: "healthy" | "degraded";
  environment: string;
  uptimeSeconds: number;
  database: {
    connected: boolean;
    latencyMs: number;
  };
  system: {
    nodeVersion: string;
    platform: string;
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
};

export default function AdminSystemPage() {
  const { data, isLoading, isError, refetch } = useQuery<SystemHealthData>({
    queryKey: ["admin-system-health"],
    queryFn: () => api<SystemHealthData>("/admin/system-health"),
    refetchInterval: 15_000,
  });

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${d > 0 ? `${d}d ` : ""}${h}h ${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">
            Infrastructure & Diagnostics
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            System Health
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live operational telemetry from the Daljir SaaS API and database cluster.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink hover:border-ink transition"
        >
          Refresh Now
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="h-44 animate-pulse bg-paper/50" />
          <Card className="h-44 animate-pulse bg-paper/50" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to fetch live health metrics.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Database Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink">PostgreSQL Database</h3>
                  <p className="text-xs text-muted">Prisma Engine Connection</p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  data.database.connected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${data.database.connected ? "bg-emerald-600" : "bg-red-600"}`} />
                {data.database.connected ? "Connected" : "Disconnected"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-line text-sm">
              <div>
                <p className="text-xs text-muted">Query Latency</p>
                <p className="mt-1 font-mono text-lg font-bold text-ink">
                  {data.database.latencyMs} ms
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Environment</p>
                <p className="mt-1 font-mono text-sm font-semibold uppercase text-ink">
                  {data.environment}
                </p>
              </div>
            </div>
          </Card>

          {/* Node.js Runtime Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper/10 text-copper">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink">Node.js Process</h3>
                  <p className="text-xs text-muted">Runtime & Memory</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Clock className="h-4 w-4" />
                <span>{formatUptime(data.uptimeSeconds)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-line text-sm">
              <div>
                <p className="text-xs text-muted">Node Version</p>
                <p className="mt-1 font-mono text-xs font-bold text-ink">
                  {data.system.nodeVersion}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Heap Used</p>
                <p className="mt-1 font-mono text-xs font-bold text-ink">
                  {data.system.heapUsedMb} MB
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">RSS Memory</p>
                <p className="mt-1 font-mono text-xs font-bold text-ink">
                  {data.system.rssMb} MB
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
