"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ApiError } from "@/lib/api";
import { ErrorState } from "@/components/ui/error-state";

export function AdminQueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const router = useRouter();
  const isUnauthenticated = error instanceof ApiError && error.status === 401;

  React.useEffect(() => {
    if (isUnauthenticated) {
      router.replace("/login");
    }
  }, [isUnauthenticated, router]);

  if (isUnauthenticated) {
    return null;
  }

  if (error instanceof ApiError && error.status === 403) {
    return (
      <ErrorState
        title="Access denied"
        description="Your platform administrator access was revoked or is no longer valid. Sign in again with an authorized account."
        onRetry={onRetry}
      />
    );
  }

  const description = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
  return <ErrorState description={description} onRetry={onRetry} />;
}
