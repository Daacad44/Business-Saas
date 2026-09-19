"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

const types = [
  "RETAIL",
  "WHOLESALE",
  "SUPERMARKET",
  "PHARMACY",
  "ELECTRONICS",
  "CLOTHING",
  "HARDWARE",
  "MOBILE",
  "AUTO_PARTS",
  "GENERAL_TRADING",
  "OTHER",
] as const;

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();

  const mutation = useMutation({
    mutationFn: (body: unknown) => api("/businesses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      router.push("/dashboard");
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Unable to create business");
    },
  });

  function onSubmit(formData: FormData) {
    setError(undefined);
    mutation.mutate({
      name: String(formData.get("name")),
      type: String(formData.get("type")),
      currency: String(formData.get("currency") || "USD"),
      locale: "en",
      branch: {
        name: String(formData.get("branchName")),
        code: String(formData.get("branchCode")),
      },
      warehouse: {
        name: String(formData.get("warehouseName")),
        code: String(formData.get("warehouseCode")),
      },
    });
  }

  return (
    <AuthGate requireBusiness={false}>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6 flex justify-end">
          <LanguageSwitcher />
        </div>
        <Card>
          <h1 className="font-display text-4xl">{t("title")}</h1>
          <p className="mt-2 text-muted">{t("body")}</p>
          <form action={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">{t("businessName")}</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="type">{t("businessType")}</Label>
              <Select id="type" name="type" defaultValue="RETAIL">
                {types.map((type) => (
                  <option key={type} value={type}>
                    {t(`types.${type}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">{t("currency")}</Label>
              <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
            </div>
            <div>
              <Label htmlFor="branchName">{t("branchName")}</Label>
              <Input id="branchName" name="branchName" defaultValue="Main" required />
            </div>
            <div>
              <Label htmlFor="branchCode">{t("branchCode")}</Label>
              <Input id="branchCode" name="branchCode" defaultValue="MAIN" required />
            </div>
            <div>
              <Label htmlFor="warehouseName">{t("warehouseName")}</Label>
              <Input id="warehouseName" name="warehouseName" defaultValue="Main warehouse" required />
            </div>
            <div>
              <Label htmlFor="warehouseCode">{t("warehouseCode")}</Label>
              <Input id="warehouseCode" name="warehouseCode" defaultValue="WH1" required />
            </div>
            <div className="sm:col-span-2">
              <FieldError message={error} />
              <Button type="submit" className="mt-2" disabled={mutation.isPending}>
                {t("submit")}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </AuthGate>
  );
}
