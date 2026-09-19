"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/form";
import { api } from "@/lib/api";

type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
};

export default function RolesPage() {
  const t = useTranslations("roles");
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(roles.data ?? []).map((role) => (
          <Card key={role.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">{role.name}</h2>
                <p className="mt-1 text-sm text-muted">{role.description}</p>
              </div>
              <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold">
                {role.isSystem ? t("system") : t("custom")}
              </span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("permissions")}</p>
            <p className="mt-2 text-sm text-ink/80">{role.permissionKeys.join(", ")}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
