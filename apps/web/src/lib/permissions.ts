import type { PermissionKey } from "@daljir/types";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "./auth";

/**
 * Reads permissions from the cached session for UI-level show/hide/disable
 * decisions only. The server is the authorization boundary: every mutation
 * must still handle a 403 response gracefully, since a permission granted
 * here can still be rejected by the API (e.g. stale cache, revoked role).
 */
export function usePermissions(): Set<PermissionKey> {
  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const permissions = session.data?.currentMembership?.permissions ?? [];
  return new Set(permissions);
}

export function useHasPermission(key: PermissionKey): boolean {
  return usePermissions().has(key);
}
