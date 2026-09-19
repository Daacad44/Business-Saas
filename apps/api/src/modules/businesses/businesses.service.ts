import { createBusinessSchema, updateBusinessSchema, updateBusinessSettingsSchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { provisionBusinessRoles, uniqueSlug, clientIp } from "../../lib/business-setup.js";
import { setBusinessCookie } from "../../lib/cookies.js";
import { conflict, forbidden, notFound, unauthorized } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { toSessionPayload } from "../auth/auth.presenter.js";

export async function createBusiness(req: Request, res: Response) {
  if (!req.auth) {
    throw unauthorized();
  }

  const existing = await prisma.membership.findFirst({
    where: { userId: req.auth.userId, status: "ACTIVE" },
  });
  if (existing) {
    throw conflict("You already belong to a business. Phase 1 supports one business per user as owner.");
  }

  const input = createBusinessSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: input.name,
        slug: uniqueSlug(input.name),
        type: input.type,
        phone: input.phone,
        email: input.email,
        currency: input.currency,
        timezone: input.timezone,
        locale: input.locale,
      },
    });

    await tx.businessSettings.create({
      data: { businessId: business.id },
    });

    await provisionBusinessRoles(business.id, tx);

    const ownerRole = await tx.role.findUniqueOrThrow({
      where: { businessId_slug: { businessId: business.id, slug: "owner" } },
    });

    await tx.membership.create({
      data: {
        businessId: business.id,
        userId: req.auth!.userId,
        roleId: ownerRole.id,
      },
    });

    const branch = await tx.branch.create({
      data: {
        businessId: business.id,
        name: input.branch.name,
        code: input.branch.code.toUpperCase(),
        address: input.branch.address,
        phone: input.branch.phone,
        isDefault: true,
      },
    });

    const warehouse = await tx.warehouse.create({
      data: {
        businessId: business.id,
        branchId: branch.id,
        name: input.warehouse.name,
        code: input.warehouse.code.toUpperCase(),
        isDefault: true,
      },
    });

    await writeAudit(
      {
        businessId: business.id,
        userId: req.auth!.userId,
        action: "business.onboard",
        entityType: "Business",
        entityId: business.id,
        metadata: { branchId: branch.id, warehouseId: warehouse.id },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { business, branch, warehouse };
  }, { timeout: 20000, maxWait: 10000 });

  setBusinessCookie(res, result.business.id);
  const session = await toSessionPayload(req.auth.userId, result.business.id);
  return sendData(res, { ...result, session }, 201);
}

export async function getCurrent(req: Request, res: Response) {
  if (!req.tenant) {
    throw forbidden();
  }
  const business = await prisma.business.findFirst({
    where: { id: req.tenant.businessId },
    include: { settings: true },
  });
  if (!business) {
    throw notFound("Business not found");
  }
  return sendData(res, business);
}

export async function updateCurrent(req: Request, res: Response) {
  if (!req.tenant) {
    throw forbidden();
  }
  const input = updateBusinessSchema.parse(req.body);
  const business = await prisma.business.update({
    where: { id: req.tenant.businessId },
    data: input,
  });
  await writeAudit({
    businessId: req.tenant.businessId,
    userId: req.auth?.userId,
    action: "business.update",
    entityType: "Business",
    entityId: business.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, business);
}

export async function getSettings(req: Request, res: Response) {
  if (!req.tenant) {
    throw forbidden();
  }
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId: req.tenant.businessId },
  });
  if (!settings) {
    throw notFound("Settings not found");
  }
  return sendData(res, settings);
}

export async function updateSettings(req: Request, res: Response) {
  if (!req.tenant) {
    throw forbidden();
  }
  const input = updateBusinessSettingsSchema.parse(req.body);
  const settings = await prisma.businessSettings.update({
    where: { businessId: req.tenant.businessId },
    data: input,
  });
  await writeAudit({
    businessId: req.tenant.businessId,
    userId: req.auth?.userId,
    action: "business.settings.update",
    entityType: "BusinessSettings",
    entityId: settings.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, settings);
}
