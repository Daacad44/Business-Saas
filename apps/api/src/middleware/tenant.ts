import type { PermissionKey } from "@daljir/types";
import type { NextFunction, Request, Response } from "express";
import { BUSINESS_COOKIE, setBusinessCookie } from "../lib/cookies.js";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      throw unauthorized();
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: req.auth.userId, status: "ACTIVE" },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
        business: true,
      },
    });

    if (memberships.length === 0) {
      throw forbidden("Complete onboarding to access a business");
    }

    const requestedId = (req.cookies?.[BUSINESS_COOKIE] as string | undefined) ?? memberships[0]?.businessId;
    const membership = memberships.find((item) => item.businessId === requestedId) ?? memberships[0];

    if (!membership) {
      throw forbidden("No active business membership");
    }

    // Deliberate exception to the platform's 404-not-403 convention: the caller
    // legitimately knows this business exists (they are a member of it), so a 403
    // with a machine-readable code lets the frontend show a dedicated "business
    // suspended" screen instead of a generic permission error. This does not leak
    // the existence of any OTHER tenant's resources — it only ever fires for a
    // business the caller already has an active membership in.
    if (membership.business.status === "SUSPENDED") {
      throw new AppError(
        403,
        "BUSINESS_SUSPENDED",
        "This business has been suspended by the platform. Contact support for details.",
      );
    }

    if (requestedId !== membership.businessId) {
      setBusinessCookie(res, membership.businessId);
    }

    const permissions = membership.role.permissions.map((item) => item.permission.key as PermissionKey);

    req.tenant = {
      businessId: membership.businessId,
      membership,
      permissions,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(...keys: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenant) {
      next(forbidden());
      return;
    }
    const allowed = keys.every((key) => req.tenant?.permissions.includes(key));
    if (!allowed) {
      next(forbidden());
      return;
    }
    next();
  };
}
