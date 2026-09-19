"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

type Branch = { id: string; name: string; code: string; isDefault: boolean; status: string };
type Warehouse = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  status: string;
  branch: { name: string };
};

export default function LocationsPage() {
  const t = useTranslations("locations");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();

  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<Branch[]>("/branches") });
  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api<Warehouse[]>("/warehouses"),
  });

  const createBranch = useMutation({
    mutationFn: (body: unknown) => api("/branches", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed"),
  });

  const createWarehouse = useMutation({
    mutationFn: (body: unknown) => api("/warehouses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warehouses"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed"),
  });

  const archiveBranch = useMutation({
    mutationFn: (id: string) =>
      api(`/branches/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ARCHIVED" }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  });

  const archiveWarehouse = useMutation({
    mutationFn: (id: string) =>
      api(`/warehouses/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ARCHIVED" }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warehouses"] }),
  });

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <FieldError message={error} />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">{t("addBranch")}</h2>
          <form
            className="mt-4 space-y-3"
            action={(formData) =>
              createBranch.mutate({
                name: String(formData.get("name")),
                code: String(formData.get("code")),
              })
            }
          >
            <Input name="name" placeholder={t("name")} required />
            <Input name="code" placeholder={t("code")} required />
            <Button type="submit">{t("create")}</Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-display text-2xl">{t("addWarehouse")}</h2>
          <form
            className="mt-4 space-y-3"
            action={(formData) =>
              createWarehouse.mutate({
                name: String(formData.get("name")),
                code: String(formData.get("code")),
                branchId: String(formData.get("branchId")),
              })
            }
          >
            <Input name="name" placeholder={t("name")} required />
            <Input name="code" placeholder={t("code")} required />
            <Select name="branchId" required>
              {(branches.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <Button type="submit">{t("create")}</Button>
          </form>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-line bg-paper">
          {(branches.data ?? []).map((branch) => (
            <div key={branch.id} className="flex items-center justify-between border-b border-line px-4 py-3 last:border-0">
              <div>
                <p className="font-semibold">{branch.name}</p>
                <p className="text-xs text-muted">
                  {branch.code} {branch.isDefault ? `· ${t("default")}` : ""} · {branch.status}
                </p>
              </div>
              {branch.status === "ACTIVE" ? (
                <Button size="sm" variant="ghost" onClick={() => archiveBranch.mutate(branch.id)}>
                  {t("archive")}
                </Button>
              ) : null}
            </div>
          ))}
          {branches.data?.length === 0 ? <p className="p-4 text-muted">{t("emptyBranches")}</p> : null}
        </div>
        <div className="rounded-3xl border border-line bg-paper">
          {(warehouses.data ?? []).map((warehouse) => (
            <div key={warehouse.id} className="flex items-center justify-between border-b border-line px-4 py-3 last:border-0">
              <div>
                <p className="font-semibold">{warehouse.name}</p>
                <p className="text-xs text-muted">
                  {warehouse.code} · {warehouse.branch.name} {warehouse.isDefault ? `· ${t("default")}` : ""} · {warehouse.status}
                </p>
              </div>
              {warehouse.status === "ACTIVE" ? (
                <Button size="sm" variant="ghost" onClick={() => archiveWarehouse.mutate(warehouse.id)}>
                  {t("archive")}
                </Button>
              ) : null}
            </div>
          ))}
          {warehouses.data?.length === 0 ? <p className="p-4 text-muted">{t("emptyWarehouses")}</p> : null}
        </div>
      </div>
    </div>
  );
}
