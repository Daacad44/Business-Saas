import { createBranchSchema, updateBranchSchema } from "@daljir/validation";
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

export async function listBranches(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const branches = await prisma.branch.findMany({
    where: { businessId: tenant.businessId },
    include: { _count: { select: { warehouses: true } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return sendData(res, branches);
}

export async function createBranch(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createBranchSchema.parse(req.body);
  const code = input.code.toUpperCase();
  const exists = await prisma.branch.findUnique({
    where: { businessId_code: { businessId: tenant.businessId, code } },
  });
  if (exists) {
    throw conflict("A branch with this code already exists");
  }

  const branch = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.branch.updateMany({
        where: { businessId: tenant.businessId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.branch.create({
      data: {
        businessId: tenant.businessId,
        name: input.name,
        code,
        address: input.address,
        phone: input.phone,
        isDefault: input.isDefault ?? false,
      },
    });
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "branch.create",
    entityType: "Branch",
    entityId: branch.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, branch, 201);
}

export async function updateBranch(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateBranchSchema.parse(req.body);
  const branch = await prisma.branch.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!branch) {
    throw notFound("Branch not found");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.branch.updateMany({
        where: { businessId: tenant.businessId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.branch.update({
      where: { id: branch.id },
      data: {
        name: input.name,
        code: input.code?.toUpperCase(),
        address: input.address,
        phone: input.phone,
        isDefault: input.isDefault,
        status: input.status,
      },
    });
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "branch.update",
    entityType: "Branch",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, updated);
}
