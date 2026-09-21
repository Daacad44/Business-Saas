"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ApiError } from "@/lib/api";

/** Redirects to /login when a query fails with 401 (expired session), leaving 403 to render an explicit access-denied state inline. */
export function useRedirectOnUnauthenticated(error: unknown) {
  const router = useRouter();
  const isUnauthenticated = error instanceof ApiError && error.status === 401;

  React.useEffect(() => {
    if (isUnauthenticated) {
      router.replace("/login");
    }
  }, [isUnauthenticated, router]);

  return isUnauthenticated;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Your platform administrator access was revoked or is no longer valid.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
