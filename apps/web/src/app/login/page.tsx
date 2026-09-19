"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label } from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const t = useTranslations("auth");
  const nav = useTranslations("nav");
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(undefined);
    try {
      const session = await login(String(formData.get("email")), String(formData.get("password")));
      router.push(session.currentMembership ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to log in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="font-display text-2xl text-teal">
          Daljir
        </Link>
        <LanguageSwitcher />
      </div>
      <Card>
        <h1 className="font-display text-3xl">{t("loginTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("loginBody")}</p>
        <form action={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" name="password" type="password" minLength={10} required />
          </div>
          <FieldError message={error} />
          <Button type="submit" className="w-full" disabled={pending}>
            {t("submitLogin")}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-semibold text-teal">
            {nav("register")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
