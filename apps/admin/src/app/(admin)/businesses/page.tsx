"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { SelectField } from "@/components/ui/form-field";
import { apiPaginated, buildQuery } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { apiErrorMessage, useRedirectOnUnauthenticated } from "@/lib/use-admin-query-guard";

type BusinessStatus = "ACTIVE" | "SUSPENDED";

interface BusinessListItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  currency: string;
  timezone: string;
  locale: string;
  createdAt: string;
  status: BusinessStatus;
  memberCount: number;
  branchCount: number;
  warehouseCount: number;
}

export default function AdminBusinessesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"ALL" | BusinessStatus>("ALL");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-businesses", { search, status, page, pageSize }],
    queryFn: () =>
      apiPaginated<BusinessListItem>(
        `/admin/businesses${buildQuery({ search, status, page, pageSize })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);

  function resetToFirstPage() {
    setPage(1);
  }

  const columns: DataTableColumn<BusinessListItem>[] = [
    {
      id: "name",
      header: "Business Name",
      accessor: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.name}</p>
          <p className="text-xs text-muted font-mono">{row.slug}</p>
        </div>
      ),
      sortable: true,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => (
        <Badge variant={row.status === "SUSPENDED" ? "danger" : "success"}>{row.status}</Badge>
      ),
    },
    { id: "type", header: "Type", accessor: (row) => <span className="text-xs">{row.type}</span> },
    { id: "currency", header: "Currency", accessor: (row) => <span className="font-mono text-xs">{row.currency}</span> },
    { id: "memberCount", header: "Members", accessor: (row) => row.memberCount, sortable: true, align: "end" },
    { id: "branchCount", header: "Branches", accessor: (row) => row.branchCount, align: "end" },
    { id: "warehouseCount", header: "Warehouses", accessor: (row) => row.warehouseCount, align: "end" },
    {
      id: "createdAt",
      header: "Created",
      accessor: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
      sortable: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">Tenancy Directory</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Registered Businesses</h1>
          <p className="mt-1 text-sm text-muted">All multi-tenant accounts on the Daljir SaaS platform.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-muted">
          <Building2 className="h-4 w-4 text-teal" />
          <span>Total: {data?.meta.total ?? 0}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            resetToFirstPage();
          }}
          label="Search businesses"
          placeholder="Search by name or slug"
          className="max-w-xs"
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as "ALL" | BusinessStatus);
            resetToFirstPage();
          }}
          wrapperClassName="w-40"
        >
          <option value="ALL">All</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </SelectField>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.id}
        caption="Registered businesses on the Daljir platform"
        isLoading={isLoading}
        error={isError && !isUnauthenticated ? apiErrorMessage(error) : undefined}
        onRetry={() => refetch()}
        emptyTitle="No businesses found"
        emptyDescription={search || status !== "ALL" ? "Try adjusting your filters." : "No tenants have registered yet."}
        onRowClick={(row) => router.push(`/businesses/${row.id}`)}
        className={isFetching && !isLoading ? "opacity-70" : undefined}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        totalItems={data?.meta.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          resetToFirstPage();
        }}
      />
    </div>
  );
}
