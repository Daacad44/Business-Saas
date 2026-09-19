"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

type Business = {
  id: string;
  name: string;
  type: string;
  currency: string;
  timezone: string;
  settings: {
    lowStockAlerts: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  } | null;
};

export default function SettingsPage() {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const business = useQuery({
    queryKey: ["business"],
    queryFn: () => api<Business>("/businesses/current"),
  });

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      await api("/businesses/current", {
        method: "PATCH",
        body: JSON.stringify({
          name: String(formData.get("name")),
          currency: String(formData.get("currency")),
          timezone: String(formData.get("timezone")),
        }),
      });
      await api("/businesses/current/settings", {
        method: "PATCH",
        body: JSON.stringify({
          lowStockAlerts: formData.get("lowStockAlerts") === "on",
          quietHoursStart: String(formData.get("quietHoursStart") || "") || null,
          quietHoursEnd: String(formData.get("quietHoursEnd") || "") || null,
        }),
      });
    },
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["business"] });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Save failed"),
  });

  if (business.isLoading) {
    return <p className="text-muted">…</p>;
  }

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <Card className="mt-6 max-w-xl">
        <form
          action={(formData) => {
            setError(undefined);
            setSaved(false);
            mutation.mutate(formData);
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" defaultValue={business.data?.name} required />
          </div>
          <div>
            <Label htmlFor="currency">{t("currency")}</Label>
            <Input id="currency" name="currency" defaultValue={business.data?.currency} maxLength={3} />
          </div>
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" name="timezone" defaultValue={business.data?.timezone} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="lowStockAlerts"
              defaultChecked={business.data?.settings?.lowStockAlerts ?? true}
            />
            {t("lowStock")}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quietHoursStart">{t("quietStart")}</Label>
              <Input
                id="quietHoursStart"
                name="quietHoursStart"
                placeholder="22:00"
                defaultValue={business.data?.settings?.quietHoursStart ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="quietHoursEnd">{t("quietEnd")}</Label>
              <Input
                id="quietHoursEnd"
                name="quietHoursEnd"
                placeholder="07:00"
                defaultValue={business.data?.settings?.quietHoursEnd ?? ""}
              />
            </div>
          </div>
          <FieldError message={error} />
          {saved ? <p className="text-sm text-teal">{t("saved")}</p> : null}
          <Button type="submit" disabled={mutation.isPending}>
            {t("save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
