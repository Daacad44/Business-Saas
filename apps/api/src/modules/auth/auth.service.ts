import { InvitationStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { acceptInvitationSchema, loginSchema, registerSchema } from "@daljir/validation";
import { writeAudit } from "../../lib/audit.js";
import {
  ACCESS_COOKIE,
  BUSINESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  clearBusinessCookie,
  setAuthCookies,
  setBusinessCookie,
} from "../../lib/cookies.js";
import { env } from "../../lib/env.js";
import { badRequest, conflict, forbidden, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import {
  createRefreshToken,
  hashToken,
  refreshExpiry,
  signAccessToken,
} from "../../lib/tokens.js";
import { clientIp } from "../../lib/business-setup.js";
import { toSessionPayload } from "./auth.presenter.js";

async function issueSession(userId: string, req: Request, res: Response, businessId?: string | null) {
  const refreshToken = createRefreshToken();
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: req.get("user-agent") ?? null,
      ipAddress: clientIp(req.ip),
      expiresAt: refreshExpiry(),
    },
  });

  const accessToken = await signAccessToken({ sub: userId, sid: session.id });
  setAuthCookies(res, {
    accessToken,
    refreshToken,
    refreshExpiresAt: session.expiresAt,
  });

  if (businessId) {
    setBusinessCookie(res, businessId);
  }

  return toSessionPayload(userId, businessId);
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const invitation = input.invitationToken
    ? await prisma.invitation.findUnique({
        where: { tokenHash: hashToken(input.invitationToken) },
      })
    : null;

  if (input.invitationToken && (!invitation || invitation.status !== InvitationStatus.PENDING)) {
    throw badRequest("Invitation is invalid or already used");
  }
  if (invitation && invitation.expiresAt < new Date()) {
    throw badRequest("Invitation has expired");
  }
  if (invitation && invitation.email !== input.email) {
    throw badRequest("Invitation email does not match");
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        passwordHash,
        status: "ACTIVE",
      },
    });

    if (invitation) {
      await tx.membership.create({
        data: {
          businessId: invitation.businessId,
          userId: created.id,
          roleId: invitation.roleId,
          status: "ACTIVE",
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
    }

    await writeAudit(
      {
        userId: created.id,
        businessId: invitation?.businessId ?? null,
        action: invitation ? "auth.register_invite" : "auth.register",
        entityType: "User",
        entityId: created.id,
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return created;
  });

  const payload = await issueSession(user.id, req, res, invitation?.businessId ?? null);
  return sendData(res, payload, 201);
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw unauthorized("Invalid email or password");
  }
  if (user.status !== "ACTIVE") {
    throw forbidden("Account is disabled");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await writeAudit({
    userId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    ipAddress: clientIp(req.ip),
  });

  const payload = await issueSession(user.id, req, res);
  return sendData(res, payload);
}

export async function logout(req: Request, res: Response) {
  const refresh = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (refresh) {
    await prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(refresh), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  if (req.auth?.sessionId) {
    await prisma.session.updateMany({
      where: { id: req.auth.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(res);
  clearBusinessCookie(res);
  return sendData(res, { ok: true });
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!refreshToken) {
    throw unauthorized("Missing refresh token");
  }

  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    clearAuthCookies(res);
    throw unauthorized("Refresh token is invalid");
  }

  const nextRefresh = createRefreshToken();
  const expiresAt = refreshExpiry();
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(nextRefresh),
      expiresAt,
    },
  });

  const accessToken = await signAccessToken({ sub: session.userId, sid: session.id });
  setAuthCookies(res, {
    accessToken,
    refreshToken: nextRefresh,
    refreshExpiresAt: expiresAt,
  });

  const businessId = (req.cookies?.[BUSINESS_COOKIE] as string | undefined) ?? null;
  return sendData(res, await toSessionPayload(session.userId, businessId));
}

export async function me(req: Request, res: Response) {
  if (!req.auth) {
    throw unauthorized();
  }
  const businessId = (req.cookies?.[BUSINESS_COOKIE] as string | undefined) ?? null;
  return sendData(res, await toSessionPayload(req.auth.userId, businessId));
}

export async function switchBusiness(req: Request, res: Response) {
  if (!req.auth) {
    throw unauthorized();
  }
  const businessId = String(req.body?.businessId ?? "");
  const membership = await prisma.membership.findFirst({
    where: { userId: req.auth.userId, businessId, status: "ACTIVE" },
  });
  if (!membership) {
    throw forbidden("You are not a member of this business");
  }
  setBusinessCookie(res, businessId);
  return sendData(res, await toSessionPayload(req.auth.userId, businessId));
}

export async function acceptInvitation(req: Request, res: Response) {
  if (!req.auth) {
    throw unauthorized();
  }
  const input = acceptInvitationSchema.parse(req.body);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    throw badRequest("Invitation is invalid or expired");
  }
  if (invitation.email !== req.auth.user.email) {
    throw forbidden("This invitation was sent to a different email");
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: {
        businessId_userId: { businessId: invitation.businessId, userId: req.auth!.userId },
      },
      update: { roleId: invitation.roleId, status: "ACTIVE" },
      create: {
        businessId: invitation.businessId,
        userId: req.auth!.userId,
        roleId: invitation.roleId,
        status: "ACTIVE",
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await writeAudit(
      {
        businessId: invitation.businessId,
        userId: req.auth!.userId,
        action: "invitation.accept",
        entityType: "Invitation",
        entityId: invitation.id,
        ipAddress: clientIp(req.ip),
      },
      tx,
    );
  });

  setBusinessCookie(res, invitation.businessId);
  return sendData(res, await toSessionPayload(req.auth.userId, invitation.businessId));
}

export function cookieNames() {
  return { ACCESS_COOKIE, REFRESH_COOKIE, BUSINESS_COOKIE, ttl: env.JWT_ACCESS_TTL };
}
