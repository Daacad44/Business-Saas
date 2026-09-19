"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

export function AuthGate({
  children,
  requireBusiness = true,
}: {
  children: React.ReactNode;
  requireBusiness?: boolean;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    retry: false,
  });

  useEffect(() => {
    if (session.isError) {
      const error = session.error;
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
      }
    }
    if (session.data) {
      const hasBusiness = Boolean(session.data.currentMembership);
      if (requireBusiness && !hasBusiness && pathname !== "/onboarding") {
        router.replace("/onboarding");
      }
      if (!requireBusiness && hasBusiness && pathname === "/onboarding") {
        router.replace("/dashboard");
      }
    }
  }, [session.data, session.isError, session.error, requireBusiness, pathname, router]);

  if (session.isLoading) {
    return <p className="p-8 text-muted">{t("loading")}</p>;
  }

  if (session.isError && !(session.error instanceof ApiError && session.error.status === 401)) {
    return (
      <div className="p-8">
        <p className="text-red-700">{t("error")}</p>
        <button type="button" className="mt-3 underline" onClick={() => session.refetch()}>
          {t("retry")}
        </button>
      </div>
    );
  }

  if (!session.data) {
    return <p className="p-8 text-muted">{t("loading")}</p>;
  }

  return <>{children}</>;
}
