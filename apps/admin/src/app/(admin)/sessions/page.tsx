"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { KeySquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SelectField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, apiPaginated, buildQuery } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { apiErrorMessage, useRedirectOnUnauthenticated } from "@/lib/use-admin-query-guard";

interface SessionItem {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; fullName: string };
}

export default function AdminSessionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [revokeTarget, setRevokeTarget] = React.useState<SessionItem | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-sessions", { activeOnly, page, pageSize }],
    queryFn: () => apiPaginated<SessionItem>(`/admin/sessions${buildQuery({ activeOnly, page, pageSize })}`),
    placeholderData: (previous) => previous,
  });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api(`/admin/sessions/${sessionId}/revoke`, { method: "POST" }),
    onSuccess: async () => {
      toast({ title: "Session revoked", variant: "success" });
      setRevokeTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
    onError: (mutationError: unknown) => {
      toast({
        title: "Could not revoke session",
        description: mutationError instanceof ApiError ? mutationError.message : "Please try again.",
        variant: "error",
      });
    },
  });

  const columns: DataTableColumn<SessionItem>[] = [
    {
      id: "user",
      header: "User",
      accessor: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.user.fullName}</p>
          <p className="text-xs text-muted">{row.user.email}</p>
        </div>
      ),
    },
    { id: "ip", header: "IP Address", accessor: (row) => <span className="font-mono text-xs text-muted">{row.ipAddress ?? "—"}</span> },
    {
      id: "userAgent",
      header: "Device",
      accessor: (row) => <span className="text-xs text-muted truncate block max-w-[220px]">{row.userAgent ?? "Unknown"}</span>,
    },
    { id: "createdAt", header: "Created", accessor: (row) => <span className="text-xs text-muted">{formatDateTime(row.createdAt)}</span> },
    { id: "expiresAt", header: "Expires", accessor: (row) => <span className="text-xs text-muted">{formatDateTime(row.expiresAt)}</span> },
    {
      id: "status",
      header: "Status",
      accessor: (row) =>
        row.revokedAt ? (
          <Badge variant="neutral">Revoked</Badge>
        ) : new Date(row.expiresAt) < new Date() ? (
          <Badge variant="warning">Expired</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">Access Control</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Sessions</h1>
          <p className="mt-1 text-sm text-muted">Active login sessions across every platform user.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-muted">
          <KeySquare className="h-4 w-4 text-teal" />
          <span>Total: {data?.meta.total ?? 0}</span>
        </div>
      </div>

      <SelectField
        label="Filter"
        value={activeOnly ? "active" : "all"}
        onChange={(event) => {
          setActiveOnly(event.target.value === "active");
          setPage(1);
        }}
        wrapperClassName="w-48"
      >
        <option value="active">Active sessions only</option>
        <option value="all">All sessions</option>
      </SelectField>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.id}
        caption="Platform login sessions"
        isLoading={isLoading}
        error={isError && !isUnauthenticated ? apiErrorMessage(error) : undefined}
        onRetry={() => refetch()}
        emptyTitle="No sessions found"
        emptyDescription={activeOnly ? "No active sessions right now." : "No sessions recorded yet."}
        rowActions={(row) =>
          !row.revokedAt ? (
            <Button type="button" variant="danger" size="sm" onClick={() => setRevokeTarget(row)}>
              Revoke
            </Button>
          ) : null
        }
        className={isFetching && !isLoading ? "opacity-70" : undefined}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        totalItems={data?.meta.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
        }}
        title="Revoke this session?"
        description={
          revokeTarget
            ? `${revokeTarget.user.fullName} (${revokeTarget.user.email}) will be signed out immediately on that device.`
            : undefined
        }
        confirmLabel="Revoke session"
        destructive
        pending={revokeMutation.isPending}
      />
    </div>
  );
}
