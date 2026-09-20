"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { getSession } from "@/lib/auth";
import { Button } from "./ui/button";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    retry: false,
  });

  React.useEffect(() => {
    if (!isLoading && (isError || !data?.user)) {
      router.replace("/login");
    }
  }, [isLoading, isError, data, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal border-t-transparent" />
      </div>
    );
  }

  if (!data?.user) {
    return null;
  }

  if (data.user.platformRole !== "SUPER_ADMIN") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-3xl border border-line bg-paper p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mt-4 font-display text-2xl text-ink">Access Denied</h2>
          <p className="mt-2 text-sm text-muted">
            You are logged in as <strong>{data.user.email}</strong>, but your account does not have Platform Super Admin privileges.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={async () => {
                await fetch("/api/v1/auth/logout", { method: "POST" });
                router.replace("/login");
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
