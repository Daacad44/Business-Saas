import type { PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG, SYSTEM_ROLE_TEMPLATES } from "./rbac.js";

/**
 * Transaction-scoped advisory lock key. Concurrent API replicas (and the
 * deploy-time CLI) serialize catalog upserts the same way stock/numbering
 * mutations do: `pg_advisory_xact_lock(hashtextextended(...))`.
 */
export const REFERENCE_DATA_LOCK_KEY = "daljir:reference-data:permission-catalog";

export type ReferenceDataSyncResult = {
  catalogSize: number;
  permissionCount: number;
  upsertedKeys: string[];
  unknownKeys: string[];
  systemRoleGrantsAdded: number;
  rolePermissionCount: number;
};

/**
 * Production-safe reference-data sync.
 *
 * - Upserts every `PERMISSION_CATALOG` row by natural key (`Permission.key`).
 * - Adds missing `RolePermission` rows for `isSystem` roles so templates stay
 *   authorizable after a catalog key is added, or after an empty-catalog onboard.
 * - NEVER deletes a `Permission` or `RolePermission` row.
 * - Unknown keys already in the database are logged and left in place.
 */
export async function syncReferenceData(client: PrismaClient): Promise<ReferenceDataSyncResult> {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${REFERENCE_DATA_LOCK_KEY}, 0))`;

      const existing = await tx.permission.findMany({ select: { key: true } });
      const catalogKeySet = new Set<string>(PERMISSION_CATALOG.map((item) => item.key));
      const unknownKeys = existing.map((row) => row.key).filter((key) => !catalogKeySet.has(key));

      for (const permission of PERMISSION_CATALOG) {
        await tx.permission.upsert({
          where: { key: permission.key },
          update: {
            family: permission.family,
            description: permission.description,
          },
          create: permission,
        });
      }

      const permissions = await tx.permission.findMany({ select: { id: true, key: true } });
      const permissionIdByKey = new Map(permissions.map((row) => [row.key, row.id]));

      const systemRoles = await tx.role.findMany({
        where: { isSystem: true },
        select: { id: true, slug: true },
      });
      const templateBySlug = new Map<string, (typeof SYSTEM_ROLE_TEMPLATES)[number]>(
        SYSTEM_ROLE_TEMPLATES.map((template) => [template.slug, template]),
      );

      const desiredLinks: Array<{ roleId: string; permissionId: string }> = [];
      for (const role of systemRoles) {
        const template = templateBySlug.get(role.slug);
        if (!template) continue;
        for (const key of template.permissions) {
          const permissionId = permissionIdByKey.get(key);
          if (permissionId) {
            desiredLinks.push({ roleId: role.id, permissionId });
          }
        }
      }

      let systemRoleGrantsAdded = 0;
      if (desiredLinks.length > 0) {
        const existingGrants = await tx.rolePermission.findMany({
          where: { roleId: { in: systemRoles.map((role) => role.id) } },
          select: { roleId: true, permissionId: true },
        });
        const existingSet = new Set(existingGrants.map((row) => `${row.roleId}:${row.permissionId}`));
        const missing = desiredLinks.filter((link) => !existingSet.has(`${link.roleId}:${link.permissionId}`));
        if (missing.length > 0) {
          const created = await tx.rolePermission.createMany({ data: missing, skipDuplicates: true });
          systemRoleGrantsAdded = created.count;
        }
      }

      if (unknownKeys.length > 0) {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "Unknown Permission keys left in place; nothing was deleted",
            unknownKeyCount: unknownKeys.length,
            unknownKeys,
          }),
        );
      }

      const [permissionCount, rolePermissionCount] = await Promise.all([
        tx.permission.count(),
        tx.rolePermission.count(),
      ]);

      return {
        catalogSize: PERMISSION_CATALOG.length,
        permissionCount,
        upsertedKeys: PERMISSION_CATALOG.map((item) => item.key),
        unknownKeys,
        systemRoleGrantsAdded,
        rolePermissionCount,
      };
    },
    { timeout: 20000, maxWait: 10000 },
  );
}
