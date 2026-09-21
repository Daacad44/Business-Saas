"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, Ban, Building2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/form";
import { TextareaField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useRedirectOnUnauthenticated } from "@/lib/use-admin-query-guard";
import { AdminQueryError } from "@/components/admin-query-error";

type BusinessStatus = "ACTIVE" | "SUSPENDED";

interface BusinessDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  currency: string;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  status: BusinessStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  owner: { id: string; email: string; fullName: string } | null;
  counts: {
    members: number;
    branches: number;
    warehouses: number;
    products: number;
    customers: number;
    sales: number;
    purchases: number;
  };
  outstandingDebtTotal: string;
}

export default function AdminBusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [confirmAction, setConfirmAction] = React.useState<"suspend" | "reactivate" | null>(null);
  const [reason, setReason] = React.useState("");

  const { data, isLoading, isError, error, refetch } = useQuery<BusinessDetail>({
    queryKey: ["admin-business-detail", params.id],
    queryFn: () => api<BusinessDetail>(`/admin/businesses/${params.id}`),
  });

  const isUnauthenticated = useRedirectOnUnauthenticated(error);

  const suspendMutation = useMutation({
    mutationFn: () => api(`/admin/businesses/${params.id}/suspend`, { method: "POST", body: JSON.stringify({ reason: reason || undefined }) }),
    onSuccess: async () => {
      toast({ title: "Business suspended", variant: "success" });
      setConfirmAction(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-business-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
    },
    onError: (mutationError: unknown) => {
      toast({
        title: "Could not suspend business",
        description: mutationError instanceof ApiError ? mutationError.message : "Please try again.",
        variant: "error",
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api(`/admin/businesses/${params.id}/reactivate`, { method: "POST" }),
    onSuccess: async () => {
      toast({ title: "Business reactivated", variant: "success" });
      setConfirmAction(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-business-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
    },
    onError: (mutationError: unknown) => {
      toast({
        title: "Could not reactivate business",
        description: mutationError instanceof ApiError ? mutationError.message : "Please try again.",
        variant: "error",
      });
    },
  });

  const pending = suspendMutation.isPending || reactivateMutation.isPending;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push("/businesses")}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to businesses
      </button>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      ) : isError && !isUnauthenticated ? (
        <AdminQueryError error={error} onRetry={() => refetch()} />
      ) : isUnauthenticated || !data ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal/10 text-teal">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold text-ink">{data.name}</h1>
                  <Badge variant={data.status === "SUSPENDED" ? "danger" : "success"}>{data.status}</Badge>
                </div>
                <p className="text-xs font-mono text-muted">{data.slug}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {data.status === "ACTIVE" ? (
                <Button variant="danger" onClick={() => setConfirmAction("suspend")}>
                  <Ban className="h-4 w-4" /> Suspend business
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setConfirmAction("reactivate")}>
                  <PlayCircle className="h-4 w-4" /> Reactivate business
                </Button>
              )}
            </div>
          </div>

          {data.status === "SUSPENDED" ? (
            <Card className="border-red-200 bg-red-50 text-red-900">
              <p className="text-sm font-semibold">This business is suspended and its owner cannot sign in.</p>
              {data.suspendedReason ? <p className="mt-1 text-sm">Reason: {data.suspendedReason}</p> : null}
              {data.suspendedAt ? <p className="mt-1 text-xs opacity-80">Since {formatDateTime(data.suspendedAt)}</p> : null}
            </Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Members" value={data.counts.members} />
            <StatCard label="Branches" value={data.counts.branches} />
            <StatCard label="Warehouses" value={data.counts.warehouses} />
            <StatCard label="Products" value={data.counts.products} />
            <StatCard label="Customers" value={data.counts.customers} />
            <StatCard label="Sales" value={data.counts.sales} />
            <StatCard label="Purchases" value={data.counts.purchases} />
            <StatCard label="Outstanding Debt" value={formatMoney(data.outstandingDebtTotal, { currency: data.currency })} />
          </div>

          <Card>
            <h3 className="font-display text-lg font-semibold text-ink">Account details</h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted">Business type</dt>
                <dd className="mt-1 text-ink">{data.type}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Currency</dt>
                <dd className="mt-1 font-mono text-ink">{data.currency}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Timezone</dt>
                <dd className="mt-1 text-ink">{data.timezone}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Owner</dt>
                <dd className="mt-1 text-ink">{data.owner ? `${data.owner.fullName} (${data.owner.email})` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Created</dt>
                <dd className="mt-1 text-ink">{formatDate(data.createdAt)}</dd>
              </div>
            </dl>
          </Card>
        </>
      )}

      <Modal
        open={confirmAction === "suspend"}
        onClose={() => {
          setConfirmAction(null);
          setReason("");
        }}
        title="Suspend this business?"
        description="The owner and all staff will immediately lose access. Tenant data is preserved and can be restored by reactivating."
        preventClose={pending}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirmAction(null);
                setReason("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={() => suspendMutation.mutate()} disabled={pending}>
              {pending ? "Suspending..." : "Suspend business"}
            </Button>
          </>
        }
      >
        <TextareaField
          label="Reason (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Non-payment, terms of service violation"
          rows={3}
        />
      </Modal>

      <ConfirmDialog
        open={confirmAction === "reactivate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => reactivateMutation.mutate()}
        title="Reactivate this business?"
        description="The owner and staff will regain access immediately."
        confirmLabel="Reactivate business"
        pending={pending}
      />
    </div>
  );
}
