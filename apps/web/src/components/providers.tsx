"use client";

import type { SessionPayload } from "@daljir/types";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ToastProvider } from "./ui/toast";

/**
 * Clears every cached query except the session itself whenever the
 * authenticated business changes (multi-business membership switch), so a
 * screen can never render stale data from a previously selected tenant.
 */
function BusinessScopeGuard() {
  const queryClient = useQueryClient();
  const previousBusinessId = useRef<string | null | undefined>(undefined);
  const session = useQuery<SessionPayload>({
    queryKey: ["session"],
    queryFn: () => Promise.reject(new Error("session query is only ever populated elsewhere")),
    enabled: false,
    staleTime: Infinity,
  });

  const currentBusinessId = session.data?.currentMembership?.businessId ?? null;

  useEffect(() => {
    if (previousBusinessId.current !== undefined && previousBusinessId.current !== currentBusinessId) {
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
    }
    previousBusinessId.current = currentBusinessId;
  }, [currentBusinessId, queryClient]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BusinessScopeGuard />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
