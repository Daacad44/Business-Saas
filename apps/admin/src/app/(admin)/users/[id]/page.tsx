"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, Shield, ShieldCheck, Users } from "lucide-react";
import { AdminQueryError } from "@/components/admin-query-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useRedirectOnUnauthenticated } from "@/lib/use-admin-query-guard";

type PlatformRole = "USER" | "SUPER_ADMIN";

interface MembershipRow {
  id: string;
  status: string;
  createdAt: string;
  business: { id: string; name: string; slug: string };
  role: { id: string; name: string; slug: string };
}

interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  platformRole: PlatformRole;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  emailVerifiedAt: string | null;
  memberships: MembershipRow[];
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmingRoleChange, setConfirmingRoleChange] = React.useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<UserDetail>({
    queryKey: ["admin-user-detail", params.id],
    queryFn: () => api<UserDetail>(`/admin/users/${params.id}`),
  });

  const { data: session } = useQuery({ queryKey: ["session"], queryFn: getSession });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);
  const isSelf = session?.user.id === params.id;

  const roleMutation = useMutation({
    mutationFn: (nextRole: PlatformRole) =>
      api(`/admin/users/${params.id}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ platformRole: nextRole }),
      }),
    onSuccess: async (_result, nextRole) => {
      toast({
        title: nextRole === "SUPER_ADMIN" ? "Super Admin access granted" : "Super Admin access revoked",
        variant: "success",
      });
      setConfirmingRoleChange(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (mutationError: unknown) => {
      toast({
        title: "Could not update platform role",
        description: mutationError instanceof ApiError ? mutationError.message : "Please try again.",
        variant: "error",
      });
      setConfirmingRoleChange(false);
    },
  });

  const nextRole: PlatformRole | null = data
    ? data.platformRole === "SUPER_ADMIN"
      ? "USER"
      : "SUPER_ADMIN"
    : null;

  const blockSelfDemotion = isSelf && data?.platformRole === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push("/users")}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to users
      </button>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40" />
        </div>
      ) : isError && !isUnauthenticated ? (
        <AdminQueryError error={error} onRetry={() => refetch()} />
      ) : isUnauthenticated || !data ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-copper/10 text-copper">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold text-ink">{data.fullName}</h1>
                  <Badge variant={data.status === "ACTIVE" ? "success" : "warning"}>{data.status}</Badge>
                </div>
                <p className="text-xs text-muted">{data.email}</p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {data.platformRole === "SUPER_ADMIN" ? (
                <Badge variant="copper">
                  <ShieldCheck className="h-3.5 w-3.5" /> SUPER_ADMIN
                </Badge>
              ) : (
                <Badge variant="neutral">
                  <Shield className="h-3.5 w-3.5" /> USER
                </Badge>
              )}
              <Button
                type="button"
                variant={data.platformRole === "SUPER_ADMIN" ? "danger" : "primary"}
                size="sm"
                disabled={blockSelfDemotion}
                onClick={() => setConfirmingRoleChange(true)}
                title={blockSelfDemotion ? "You cannot revoke your own Super Admin role" : undefined}
              >
                {data.platformRole === "SUPER_ADMIN" ? "Revoke Super Admin" : "Grant Super Admin"}
              </Button>
              {blockSelfDemotion ? (
                <p className="max-w-56 text-right text-[11px] text-muted">
                  You cannot revoke your own Super Admin role — ask another platform admin.
                </p>
              ) : null}
            </div>
          </div>

          <Card>
            <h3 className="font-display text-lg font-semibold text-ink">Account details</h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted">Phone</dt>
                <dd className="mt-1 text-ink">{data.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Last login</dt>
                <dd className="mt-1 text-ink">{data.lastLoginAt ? formatDateTime(data.lastLoginAt) : "Never"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Registered</dt>
                <dd className="mt-1 text-ink">{formatDateTime(data.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Email verified</dt>
                <dd className="mt-1 text-ink">{data.emailVerifiedAt ? formatDateTime(data.emailVerifiedAt) : "Not verified"}</dd>
              </div>
            </dl>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="p-6 pb-0">
              <h3 className="font-display text-lg font-semibold text-ink">Business memberships</h3>
            </div>
            {data.memberships.length === 0 ? (
              <p className="p-6 text-sm text-muted">This user does not belong to any business.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-t border-b border-line bg-sand/40 text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Business</th>
                      <th className="px-6 py-3 font-semibold">Role</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.memberships.map((membership) => (
                      <tr key={membership.id}>
                        <td className="px-6 py-3">
                          <p className="font-semibold text-ink">{membership.business.name}</p>
                          <p className="text-xs font-mono text-muted">{membership.business.slug}</p>
                        </td>
                        <td className="px-6 py-3 text-xs">{membership.role.name}</td>
                        <td className="px-6 py-3">
                          <Badge variant={membership.status === "ACTIVE" ? "success" : "warning"}>{membership.status}</Badge>
                        </td>
                        <td className="px-6 py-3 text-xs text-muted">{formatDateTime(membership.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmingRoleChange && nextRole !== null}
        onClose={() => setConfirmingRoleChange(false)}
        onConfirm={() => {
          if (nextRole) roleMutation.mutate(nextRole);
        }}
        title={nextRole === "SUPER_ADMIN" ? "Grant Super Admin access?" : "Revoke Super Admin access?"}
        description={
          nextRole === "SUPER_ADMIN"
            ? `${data?.fullName ?? "This user"} will gain full platform administrator privileges, including access to every business.`
            : `${data?.fullName ?? "This user"} will immediately lose platform administrator privileges.`
        }
        confirmLabel={nextRole === "SUPER_ADMIN" ? "Grant Super Admin" : "Revoke Super Admin"}
        destructive={nextRole === "USER"}
        pending={roleMutation.isPending}
      />
    </div>
  );
}
