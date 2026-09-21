import type { PermissionKey } from "@daljir/types";
import { prisma } from "../../lib/prisma.js";

export async function toSessionPayload(userId: string, businessId?: string | null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      business: true,
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const mapped = memberships.map((membership) => ({
    id: membership.id,
    businessId: membership.businessId,
    businessName: membership.business.name,
    businessStatus: membership.business.status,
    roleId: membership.roleId,
    roleName: membership.role.name,
    roleSlug: membership.role.slug,
    permissions: membership.role.permissions.map((item) => item.permission.key as PermissionKey),
  }));

  const current =
    mapped.find((item) => item.businessId === businessId) ?? mapped[0] ?? null;

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      status: user.status,
      platformRole: user.platformRole,
    },
    memberships: mapped,
    currentMembership: current,
  };
}
