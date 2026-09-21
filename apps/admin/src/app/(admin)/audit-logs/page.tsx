"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { FileText } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateField, TextField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { apiPaginated, buildQuery } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { apiErrorMessage, useRedirectOnUnauthenticated } from "@/lib/use-admin-query-guard";

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  ipAddress: string | null;
  business: { id: string; name: string; slug: string } | null;
  user: { id: string; email: string; fullName: string } | null;
}

interface Filters {
  action: string;
  entityType: string;
  businessId: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = { action: "", entityType: "", businessId: "", userId: "", dateFrom: "", dateTo: "" };

export default function AdminAuditLogsPage() {
  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-audit-logs", { ...filters, page, pageSize }],
    queryFn: () =>
      apiPaginated<AuditLogItem>(`/admin/audit-logs${buildQuery({ ...filters, page, pageSize })}`),
    placeholderData: (previous) => previous,
  });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  const columns: DataTableColumn<AuditLogItem>[] = [
    {
      id: "createdAt",
      header: "Timestamp",
      accessor: (row) => <span className="font-mono text-xs text-muted whitespace-nowrap">{formatDateTime(row.createdAt)}</span>,
    },
    {
      id: "action",
      header: "Action",
      accessor: (row) => <span className="inline-block rounded-md bg-sand px-2 py-0.5 font-mono text-xs">{row.action}</span>,
    },
    {
      id: "entity",
      header: "Target Entity",
      accessor: (row) => (
        <div className="text-xs">
          <span className="font-semibold text-ink">{row.entityType}</span>
          {row.entityId ? <p className="font-mono text-[11px] text-muted truncate max-w-[140px]">{row.entityId}</p> : null}
        </div>
      ),
    },
    {
      id: "user",
      header: "Actor",
      accessor: (row) =>
        row.user ? (
          <div className="text-xs">
            <p className="font-semibold text-ink">{row.user.fullName}</p>
            <p className="text-muted">{row.user.email}</p>
          </div>
        ) : (
          <span className="text-xs text-muted">System</span>
        ),
    },
    {
      id: "business",
      header: "Business",
      accessor: (row) => (row.business ? <span className="text-xs font-semibold text-ink">{row.business.name}</span> : <span className="text-xs text-muted">—</span>),
    },
    { id: "ip", header: "IP Address", accessor: (row) => <span className="font-mono text-xs text-muted">{row.ipAddress ?? "—"}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">Compliance &amp; Security</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Audit Logs</h1>
          <p className="mt-1 text-sm text-muted">Immutable log of sensitive operations across all tenants.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-muted">
          <FileText className="h-4 w-4 text-teal" />
          <span>Total: {data?.meta.total ?? 0}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Action"
          placeholder="e.g. platform.business.suspend"
          value={filters.action}
          onChange={(event) => updateFilter("action", event.target.value)}
          wrapperClassName="w-56"
        />
        <TextField
          label="Entity type"
          placeholder="e.g. Business"
          value={filters.entityType}
          onChange={(event) => updateFilter("entityType", event.target.value)}
          wrapperClassName="w-40"
        />
        <TextField
          label="Business ID"
          placeholder="business ID"
          value={filters.businessId}
          onChange={(event) => updateFilter("businessId", event.target.value)}
          wrapperClassName="w-48"
        />
        <TextField
          label="User ID"
          placeholder="user ID"
          value={filters.userId}
          onChange={(event) => updateFilter("userId", event.target.value)}
          wrapperClassName="w-48"
        />
        <DateField label="From" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} wrapperClassName="w-40" />
        <DateField label="To" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} wrapperClassName="w-40" />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
        >
          Clear filters
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.id}
        caption="Platform audit log"
        isLoading={isLoading}
        error={isError && !isUnauthenticated ? apiErrorMessage(error) : undefined}
        onRetry={() => refetch()}
        emptyTitle="No audit records found"
        emptyDescription="Try widening your filters or date range."
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
    </div>
  );
}
