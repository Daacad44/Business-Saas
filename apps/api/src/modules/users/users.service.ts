import { randomBytes } from "node:crypto";
import { inviteUserSchema, updateMembershipSchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { env } from "../../lib/env.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { hashToken } from "../../lib/tokens.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

export async function listUsers(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const memberships = await prisma.membership.findMany({
    where: { businessId: tenant.businessId },
    include: {
      user: {
        select: { id: true, email: true, fullName: true, phone: true, status: true, lastLoginAt: true },
      },
      role: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return sendData(res, memberships);
}

export async function inviteUser(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = inviteUserSchema.parse(req.body);

  const role = await prisma.role.findFirst({
    where: { id: input.roleId, businessId: tenant.businessId },
  });
  if (!role) {
    throw notFound("Role not found");
  }
  if (role.slug === "owner") {
    throw forbidden("Owner role cannot be assigned by invitation");
  }

  const existingMember = await prisma.membership.findFirst({
    where: { businessId: tenant.businessId, user: { email: input.email } },
  });
  if (existingMember) {
    throw conflict("This user is already a member");
  }

  const pending = await prisma.invitation.findFirst({
    where: { businessId: tenant.businessId, email: input.email, status: "PENDING" },
  });
  if (pending) {
    throw conflict("An invitation is already pending for this email");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.INVITATION_TTL_DAYS);

  const invitation = await prisma.invitation.create({
    data: {
      businessId: tenant.businessId,
      email: input.email,
      roleId: role.id,
      tokenHash: hashToken(token),
      invitedById: auth.userId,
      expiresAt,
    },
    include: { role: true },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "user.invite",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email: input.email, roleId: role.id },
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, { ...invitation, token }, 201);
}

export async function updateUser(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateMembershipSchema.parse(req.body);
  const membership = await prisma.membership.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: { role: true },
  });
  if (!membership) {
    throw notFound("Member not found");
  }
  if (membership.role.slug === "owner" && membership.userId !== auth.userId) {
    throw forbidden("Owner membership cannot be changed this way");
  }
  if (input.roleId) {
    const role = await prisma.role.findFirst({
      where: { id: input.roleId, businessId: tenant.businessId },
    });
    if (!role) {
      throw notFound("Role not found");
    }
    if (role.slug === "owner") {
      throw forbidden("Cannot assign the owner role");
    }
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: {
      roleId: input.roleId,
      status: input.status,
    },
    include: {
      user: { select: { id: true, email: true, fullName: true, status: true } },
      role: true,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "user.update",
    entityType: "Membership",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, updated);
}

export async function removeUser(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const membership = await prisma.membership.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: { role: true },
  });
  if (!membership) {
    throw notFound("Member not found");
  }
  if (membership.role.slug === "owner") {
    throw forbidden("Owner cannot be removed");
  }
  if (membership.userId === auth.userId) {
    throw badRequest("You cannot remove yourself");
  }

  await prisma.membership.delete({ where: { id: membership.id } });
  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "user.remove",
    entityType: "Membership",
    entityId: membership.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, { ok: true });
}

export async function previewInvitation(req: Request, res: Response) {
  const token = String(req.params.token ?? "");
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      business: { select: { name: true } },
      role: { select: { name: true } },
    },
  });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    throw notFound("Invitation not found");
  }
  return sendData(res, {
    email: invitation.email,
    businessName: invitation.business.name,
    roleName: invitation.role.name,
    expiresAt: invitation.expiresAt,
  });
}
