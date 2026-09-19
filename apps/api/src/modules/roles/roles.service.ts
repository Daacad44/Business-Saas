import { slugify } from "@daljir/database";
import { createRoleSchema, updateRoleSchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

export async function listRoles(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const roles = await prisma.role.findMany({
    where: { businessId: tenant.businessId },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: "asc" },
  });
  return sendData(
    res,
    roles.map((role) => ({
      ...role,
      permissionKeys: role.permissions.map((item) => item.permission.key),
    })),
  );
}

export async function listPermissions(_req: Request, res: Response) {
  const permissions = await prisma.permission.findMany({ orderBy: [{ family: "asc" }, { key: "asc" }] });
  return sendData(res, permissions);
}

export async function createRole(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createRoleSchema.parse(req.body);
  const slug = slugify(input.name);
  const exists = await prisma.role.findUnique({
    where: { businessId_slug: { businessId: tenant.businessId, slug } },
  });
  if (exists) {
    throw conflict("A role with this name already exists");
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: input.permissionKeys } },
  });
  if (permissions.length !== input.permissionKeys.length) {
    throw notFound("One or more permissions are invalid");
  }

  const role = await prisma.role.create({
    data: {
      businessId: tenant.businessId,
      name: input.name,
      slug,
      description: input.description,
      isSystem: false,
      permissions: {
        create: permissions.map((permission) => ({ permissionId: permission.id })),
      },
    },
    include: { permissions: { include: { permission: true } } },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "role.create",
    entityType: "Role",
    entityId: role.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(
    res,
    { ...role, permissionKeys: role.permissions.map((item) => item.permission.key) },
    201,
  );
}

export async function updateRole(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateRoleSchema.parse(req.body);
  const role = await prisma.role.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!role) {
    throw notFound("Role not found");
  }
  if (role.isSystem && input.permissionKeys) {
    throw forbidden("System role permissions cannot be changed");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.permissionKeys) {
      const permissions = await tx.permission.findMany({
        where: { key: { in: input.permissionKeys } },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }

    return tx.role.update({
      where: { id: role.id },
      data: {
        name: input.name,
        description: input.description,
      },
      include: { permissions: { include: { permission: true } } },
    });
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "role.update",
    entityType: "Role",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, {
    ...updated,
    permissionKeys: updated.permissions.map((item) => item.permission.key),
  });
}
