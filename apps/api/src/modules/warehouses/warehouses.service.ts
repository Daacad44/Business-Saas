import { createWarehouseSchema, updateWarehouseSchema } from "@daljir/validation";
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

export async function listWarehouses(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const warehouses = await prisma.warehouse.findMany({
    where: { businessId: tenant.businessId },
    include: { branch: { select: { id: true, name: true, code: true } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return sendData(res, warehouses);
}

export async function createWarehouse(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createWarehouseSchema.parse(req.body);
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: tenant.businessId },
  });
  if (!branch) {
    throw notFound("Branch not found");
  }
  const code = input.code.toUpperCase();
  const exists = await prisma.warehouse.findUnique({
    where: { businessId_code: { businessId: tenant.businessId, code } },
  });
  if (exists) {
    throw conflict("A warehouse with this code already exists");
  }

  const warehouse = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.warehouse.updateMany({
        where: { businessId: tenant.businessId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.warehouse.create({
      data: {
        businessId: tenant.businessId,
        branchId: branch.id,
        name: input.name,
        code,
        isDefault: input.isDefault ?? false,
      },
    });
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "warehouse.create",
    entityType: "Warehouse",
    entityId: warehouse.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, warehouse, 201);
}

export async function updateWarehouse(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateWarehouseSchema.parse(req.body);
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!warehouse) {
    throw notFound("Warehouse not found");
  }

  if (input.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, businessId: tenant.businessId },
    });
    if (!branch) {
      throw notFound("Branch not found");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.warehouse.updateMany({
        where: { businessId: tenant.businessId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.warehouse.update({
      where: { id: warehouse.id },
      data: {
        branchId: input.branchId,
        name: input.name,
        code: input.code?.toUpperCase(),
        isDefault: input.isDefault,
        status: input.status,
      },
    });
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "warehouse.update",
    entityType: "Warehouse",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, updated);
}
