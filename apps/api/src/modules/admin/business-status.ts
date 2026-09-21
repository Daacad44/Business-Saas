import type { Prisma } from "@prisma/client";

export type BusinessAdminStatus = "ACTIVE" | "SUSPENDED";

export interface SuspensionMeta {
  suspended: boolean;
  suspendedAt: string | null;
  suspendedById: string | null;
  suspendedReason: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSuspensionMeta(extra: Prisma.JsonValue | null | undefined): SuspensionMeta {
  const record = isPlainObject(extra) ? extra : {};
  return {
    suspended: record.suspended === true,
    suspendedAt: typeof record.suspendedAt === "string" ? record.suspendedAt : null,
    suspendedById: typeof record.suspendedById === "string" ? record.suspendedById : null,
    suspendedReason: typeof record.suspendedReason === "string" ? record.suspendedReason : null,
  };
}

export function businessStatusFromExtra(extra: Prisma.JsonValue | null | undefined): BusinessAdminStatus {
  return readSuspensionMeta(extra).suspended ? "SUSPENDED" : "ACTIVE";
}

export function mergeSuspensionMeta(
  extra: Prisma.JsonValue | null | undefined,
  patch: Partial<SuspensionMeta>,
): Prisma.InputJsonValue {
  const base = isPlainObject(extra) ? extra : {};
  return {
    ...base,
    ...patch,
  } as Prisma.InputJsonValue;
}
