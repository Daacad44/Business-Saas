import { createUnitSchema, updateUnitSchema } from "@daljir/validation";
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

export async function listUnits(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const units = await prisma.unit.findMany({
    where: { businessId: tenant.businessId },
    orderBy: { name: "asc" },
  });
  return sendData(res, units);
}

export async function getUnit(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const unit = await prisma.unit.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!unit) {
    throw notFound("Unit not found");
  }
  return sendData(res, unit);
}

export async function createUnit(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createUnitSchema.parse(req.body);

  const exists = await prisma.unit.findUnique({
    where: { businessId_symbol: { businessId: tenant.businessId, symbol: input.symbol } },
  });
  if (exists) {
    throw conflict("A unit with this symbol already exists");
  }

  const unit = await prisma.unit.create({
    data: {
      businessId: tenant.businessId,
      name: input.name,
      symbol: input.symbol,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "unit.create",
    entityType: "Unit",
    entityId: unit.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, unit, 201);
}

export async function updateUnit(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateUnitSchema.parse(req.body);
  const unit = await prisma.unit.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!unit) {
    throw notFound("Unit not found");
  }

  if (input.symbol && input.symbol !== unit.symbol) {
    const exists = await prisma.unit.findUnique({
      where: { businessId_symbol: { businessId: tenant.businessId, symbol: input.symbol } },
    });
    if (exists) {
      throw conflict("A unit with this symbol already exists");
    }
  }

  const updated = await prisma.unit.update({
    where: { id: unit.id },
    data: {
      name: input.name,
      symbol: input.symbol,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "unit.update",
    entityType: "Unit",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, updated);
}

export async function deleteUnit(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const unit = await prisma.unit.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!unit) {
    throw notFound("Unit not found");
  }

  const inUse = await prisma.product.count({ where: { businessId: tenant.businessId, unitId: unit.id } });
  if (inUse > 0) {
    throw conflict("This unit is used by one or more products and cannot be deleted");
  }

  await prisma.unit.delete({ where: { id: unit.id } });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "unit.delete",
    entityType: "Unit",
    entityId: unit.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, { ok: true });
}
