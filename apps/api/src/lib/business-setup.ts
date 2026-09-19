import { SYSTEM_ROLE_TEMPLATES, slugify } from "@daljir/database";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export { slugify };

export function uniqueSlug(name: string) {
  const base = slugify(name) || "business";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export async function provisionBusinessRoles(
  businessId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const permissions = await client.permission.findMany();
  const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  await client.role.createMany({
    data: SYSTEM_ROLE_TEMPLATES.map((template) => ({
      businessId,
      name: template.name,
      slug: template.slug,
      description: template.description,
      isSystem: true,
    })),
  });

  const roles = await client.role.findMany({
    where: { businessId, slug: { in: SYSTEM_ROLE_TEMPLATES.map((template) => template.slug) } },
  });
  const roleBySlug = new Map(roles.map((role) => [role.slug, role.id]));

  const links = SYSTEM_ROLE_TEMPLATES.flatMap((template) => {
    const roleId = roleBySlug.get(template.slug);
    if (!roleId) return [];
    return template.permissions
      .map((key) => byKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId, permissionId }));
  });

  if (links.length > 0) {
    await client.rolePermission.createMany({ data: links });
  }
}

export function clientIp(value: string | undefined) {
  return value?.split(",")[0]?.trim() ?? null;
}
