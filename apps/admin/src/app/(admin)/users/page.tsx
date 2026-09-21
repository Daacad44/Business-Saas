"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Shield, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { SelectField } from "@/components/ui/form-field";
import { apiPaginated, buildQuery } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { apiErrorMessage, useRedirectOnUnauthenticated } from "@/lib/use-admin-query-guard";

type PlatformRole = "USER" | "SUPER_ADMIN";
type UserStatus = "ACTIVE" | "DISABLED" | "PENDING";

interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  platformRole: PlatformRole;
  createdAt: string;
  lastLoginAt: string | null;
  membershipCount: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"ALL" | UserStatus>("ALL");
  const [platformRole, setPlatformRole] = React.useState<"ALL" | PlatformRole>("ALL");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-users", { search, status, platformRole, page, pageSize }],
    queryFn: () =>
      apiPaginated<UserListItem>(
        `/admin/users${buildQuery({ search, status, platformRole, page, pageSize })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);

  function resetToFirstPage() {
    setPage(1);
  }

  const columns: DataTableColumn<UserListItem>[] = [
    {
      id: "user",
      header: "User",
      accessor: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.fullName}</p>
          <p className="text-xs text-muted">{row.email}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => <Badge variant={row.status === "ACTIVE" ? "success" : "warning"}>{row.status}</Badge>,
    },
    {
      id: "platformRole",
      header: "Platform Role",
      accessor: (row) =>
        row.platformRole === "SUPER_ADMIN" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-copper">
            <ShieldCheck className="h-3.5 w-3.5" /> SUPER_ADMIN
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Shield className="h-3.5 w-3.5" /> USER
          </span>
        ),
    },
    { id: "membershipCount", header: "Businesses", accessor: (row) => row.membershipCount, align: "end" },
    {
      id: "lastLoginAt",
      header: "Last Login",
      accessor: (row) => <span className="text-xs text-muted">{row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "Never"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">Identity &amp; Access</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Platform Users</h1>
          <p className="mt-1 text-sm text-muted">All user accounts across all businesses and platform scopes.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-muted">
          <Users className="h-4 w-4 text-copper" />
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
          label="Search users"
          placeholder="Search by name or email"
          className="max-w-xs"
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as "ALL" | UserStatus);
            resetToFirstPage();
          }}
          wrapperClassName="w-40"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="PENDING">Pending</option>
        </SelectField>
        <SelectField
          label="Platform role"
          value={platformRole}
          onChange={(event) => {
            setPlatformRole(event.target.value as "ALL" | PlatformRole);
            resetToFirstPage();
          }}
          wrapperClassName="w-44"
        >
          <option value="ALL">All roles</option>
          <option value="USER">User</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </SelectField>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.id}
        caption="Platform user accounts"
        isLoading={isLoading}
        error={isError && !isUnauthenticated ? apiErrorMessage(error) : undefined}
        onRetry={() => refetch()}
        emptyTitle="No users found"
        emptyDescription={search || status !== "ALL" || platformRole !== "ALL" ? "Try adjusting your filters." : "No users have registered yet."}
        onRowClick={(row) => router.push(`/users/${row.id}`)}
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
