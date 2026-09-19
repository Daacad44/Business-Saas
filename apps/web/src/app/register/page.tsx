"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label } from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { register } from "@/lib/auth";

function RegisterForm() {
  const t = useTranslations("auth");
  const nav = useTranslations("nav");
  const router = useRouter();
  const search = useSearchParams();
  const invitationToken = search.get("invite") ?? undefined;
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(undefined);
    try {
      const session = await register({
        fullName: String(formData.get("fullName")),
        email: String(formData.get("email")),
        password: String(formData.get("password")),
        phone: String(formData.get("phone") || "") || undefined,
        invitationToken,
      });
      router.push(session.currentMembership ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to register");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h1 className="font-display text-3xl">{t("registerTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("registerBody")}</p>
      {invitationToken ? <p className="mt-3 text-sm text-copper">{t("inviteNote")}</p> : null}
      <form action={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="fullName">{t("fullName")}</Label>
          <Input id="fullName" name="fullName" required minLength={2} />
        </div>
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input id="phone" name="phone" />
        </div>
        <div>
          <Label htmlFor="password">{t("password")}</Label>
          <Input id="password" name="password" type="password" minLength={10} required />
        </div>
        <FieldError message={error} />
        <Button type="submit" className="w-full" disabled={pending}>
          {t("submitRegister")}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-teal">
          {nav("login")}
        </Link>
      </p>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="font-display text-2xl text-teal">
          Daljir
        </Link>
        <LanguageSwitcher />
      </div>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
