"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/form";
import { api } from "@/lib/api";

type AuditLogItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  ipAddress: string | null;
  business: { id: string; name: string; slug: string } | null;
  user: { id: string; email: string; fullName: string } | null;
};

export default function AdminAuditLogsPage() {
  const { data, isLoading, isError } = useQuery<AuditLogItem[]>({
    queryKey: ["admin-audit-logs"],
    queryFn: () => api<AuditLogItem[]>("/admin/audit-logs"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">
            Compliance & Security
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-muted">
            Immutable log of sensitive operations and authentication events across all tenants.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-muted">
          <FileText className="h-4 w-4 text-teal" />
          <span>Recent Logs: {data?.length ?? 0}</span>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-sand/40 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-semibold">Timestamp</th>
                <th className="px-6 py-4 font-semibold">Action</th>
                <th className="px-6 py-4 font-semibold">Target Entity</th>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Business</th>
                <th className="px-6 py-4 font-semibold">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
                    Loading audit trail...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-red-700">
                    Failed to fetch audit logs.
                  </td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
                    No audit records recorded yet.
                  </td>
                </tr>
              ) : (
                data.map((log) => (
                  <tr key={log.id} className="hover:bg-sand/20 transition">
                    <td className="px-6 py-4 font-mono text-xs text-muted whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-ink">
                      <span className="inline-block rounded-md bg-sand px-2 py-0.5 font-mono text-xs">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted">
                      <span className="font-semibold text-ink">{log.entityType}</span>
                      {log.entityId && (
                        <span className="block font-mono text-[11px] text-muted truncate max-w-[120px]">
                          {log.entityId}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {log.user ? (
                        <div>
                          <p className="font-semibold text-ink">{log.user.fullName}</p>
                          <p className="text-muted">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted">System</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {log.business ? (
                        <p className="font-semibold text-ink">{log.business.name}</p>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted">
                      {log.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
