import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { env } from "../../lib/env.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import {
  auditLogQuerySchema,
  businessIdParamSchema,
  businessListQuerySchema,
  overviewQuerySchema,
  sessionIdParamSchema,
  sessionListQuerySchema,
  suspendBusinessBodySchema,
  updatePlatformRoleBodySchema,
  userIdParamSchema,
  userListQuerySchema,
} from "./admin.schemas.js";
import { getMigrationStatus } from "./migration-status.js";
import { pingRedis } from "./redis-health.js";

function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getOverview(req: Request, res: Response) {
  const { signupDays } = overviewQuerySchema.parse(req.query);
  const since = new Date();
  since.setDate(since.getDate() - signupDays);

  const [
    businessCount,
    userCount,
    branchCount,
    warehouseCount,
    auditLogCount,
    suspendedBusinessCount,
    activeSessionCount,
    signupRows,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.user.count(),
    prisma.branch.count(),
    prisma.warehouse.count(),
    prisma.auditLog.count(),
    prisma.business.count({ where: { status: "SUSPENDED" } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `,
  ]);

  const signupSeries = signupRows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    count: Number(row.count),
  }));

  return sendData(res, {
    businessCount,
    activeBusinessCount: businessCount - suspendedBusinessCount,
    suspendedBusinessCount,
    userCount,
    branchCount,
    warehouseCount,
    auditLogCount,
    activeSessionCount,
    signupSeries,
  });
}

export async function listBusinesses(req: Request, res: Response) {
  const { page, pageSize, search, status, sortBy, sortDir } = businessListQuerySchema.parse(req.query);

  const statusWhere: Prisma.BusinessWhereInput = status === "ALL" ? {} : { status };

  const searchWhere: Prisma.BusinessWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const where: Prisma.BusinessWhereInput = { AND: [statusWhere, searchWhere] };

  const orderBy: Prisma.BusinessOrderByWithRelationInput =
    sortBy === "memberCount"
      ? { memberships: { _count: sortDir } }
      : sortBy === "name"
        ? { name: sortDir }
        : { createdAt: sortDir };

  const [total, businesses] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { memberships: true, branches: true, warehouses: true } },
      },
    }),
  ]);

  const items = businesses.map((business) => ({
    id: business.id,
    name: business.name,
    slug: business.slug,
    type: business.type,
    currency: business.currency,
    timezone: business.timezone,
    locale: business.locale,
    createdAt: business.createdAt,
    status: business.status,
    memberCount: business._count.memberships,
    branchCount: business._count.branches,
    warehouseCount: business._count.warehouses,
  }));

  return sendData(res, items, 200, paginationMeta(page, pageSize, total));
}

export async function getBusinessDetail(req: Request, res: Response) {
  const { id } = businessIdParamSchema.parse(req.params);

  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      memberships: {
        where: { role: { slug: "owner" } },
        take: 1,
        include: { user: { select: { id: true, email: true, fullName: true } } },
      },
    },
  });
  if (!business) {
    throw notFound("Business not found");
  }

  const [memberCount, branchCount, warehouseCount, productCount, customerCount, saleCount, purchaseCount, debtAggregate] =
    await Promise.all([
      prisma.membership.count({ where: { businessId: id } }),
      prisma.branch.count({ where: { businessId: id } }),
      prisma.warehouse.count({ where: { businessId: id } }),
      prisma.product.count({ where: { businessId: id } }),
      prisma.customer.count({ where: { businessId: id } }),
      prisma.sale.count({ where: { businessId: id } }),
      prisma.purchase.count({ where: { businessId: id } }),
      prisma.customerDebt.aggregate({ where: { businessId: id }, _sum: { outstandingAmount: true } }),
    ]);

  const owner = business.memberships[0]?.user ?? null;

  return sendData(res, {
    id: business.id,
    name: business.name,
    slug: business.slug,
    type: business.type,
    currency: business.currency,
    timezone: business.timezone,
    locale: business.locale,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
    status: business.status,
    suspendedAt: business.suspendedAt,
    suspendedReason: business.suspendedReason,
    owner,
    counts: {
      members: memberCount,
      branches: branchCount,
      warehouses: warehouseCount,
      products: productCount,
      customers: customerCount,
      sales: saleCount,
      purchases: purchaseCount,
    },
    outstandingDebtTotal: (debtAggregate._sum.outstandingAmount ?? new Prisma.Decimal(0)).toString(),
  });
}

export async function suspendBusiness(req: Request, res: Response) {
  const { id } = businessIdParamSchema.parse(req.params);
  const { reason } = suspendBusinessBodySchema.parse(req.body);
  const adminId = req.auth!.userId;

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({ where: { id } });
    if (!business) {
      throw notFound("Business not found");
    }

    if (business.status === "SUSPENDED") {
      throw conflict("Business is already suspended");
    }

    await tx.business.update({
      where: { id },
      data: {
        status: "SUSPENDED",
        suspendedAt: new Date(),
        suspendedReason: reason ?? null,
      },
    });

    await writeAudit(
      {
        businessId: id,
        userId: adminId,
        action: "platform.business.suspend",
        entityType: "Business",
        entityId: id,
        metadata: { reason: reason ?? null },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { id: business.id, name: business.name, status: "SUSPENDED" as const };
  });

  return sendData(res, result);
}

export async function reactivateBusiness(req: Request, res: Response) {
  const { id } = businessIdParamSchema.parse(req.params);
  const adminId = req.auth!.userId;

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({ where: { id } });
    if (!business) {
      throw notFound("Business not found");
    }

    if (business.status !== "SUSPENDED") {
      throw conflict("Business is not currently suspended");
    }

    await tx.business.update({
      where: { id },
      data: {
        status: "ACTIVE",
        suspendedAt: null,
        suspendedReason: null,
      },
    });

    await writeAudit(
      {
        businessId: id,
        userId: adminId,
        action: "platform.business.reactivate",
        entityType: "Business",
        entityId: id,
        metadata: {},
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return { id: business.id, name: business.name, status: "ACTIVE" as const };
  });

  return sendData(res, result);
}

export async function listUsers(req: Request, res: Response) {
  const { page, pageSize, search, status, platformRole, sortBy, sortDir } = userListQuerySchema.parse(req.query);

  const where: Prisma.UserWhereInput = {
    AND: [
      status !== "ALL" ? { status } : {},
      platformRole !== "ALL" ? { platformRole } : {},
      search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { fullName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sortBy === "fullName"
      ? { fullName: sortDir }
      : sortBy === "lastLoginAt"
        ? { lastLoginAt: sortDir }
        : { createdAt: sortDir };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        platformRole: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { memberships: true } },
      },
    }),
  ]);

  const items = users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    status: user.status,
    platformRole: user.platformRole,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    membershipCount: user._count.memberships,
  }));

  return sendData(res, items, 200, paginationMeta(page, pageSize, total));
}

export async function getUserDetail(req: Request, res: Response) {
  const { id } = userIdParamSchema.parse(req.params);

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      status: true,
      platformRole: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      memberships: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          business: { select: { id: true, name: true, slug: true } },
          role: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!user) {
    throw notFound("User not found");
  }

  return sendData(res, user);
}

export async function updatePlatformRole(req: Request, res: Response) {
  const { id } = userIdParamSchema.parse(req.params);
  const { platformRole } = updatePlatformRoleBodySchema.parse(req.body);
  const adminId = req.auth!.userId;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw notFound("User not found");
  }

  if (target.id === adminId && platformRole !== "SUPER_ADMIN") {
    throw badRequest("You cannot revoke your own platform administrator role");
  }

  if (target.platformRole === platformRole) {
    throw conflict(`User already has platform role ${platformRole}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id }, data: { platformRole } });
    await writeAudit(
      {
        userId: adminId,
        action: platformRole === "SUPER_ADMIN" ? "platform.user.role.grant" : "platform.user.role.revoke",
        entityType: "User",
        entityId: id,
        metadata: { from: target.platformRole, to: platformRole },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );
    return user;
  });

  return sendData(res, {
    id: updated.id,
    email: updated.email,
    fullName: updated.fullName,
    platformRole: updated.platformRole,
  });
}

export async function getSystemHealth(_req: Request, res: Response) {
  const [database, redis, migrations] = await Promise.all([
    (async () => {
      try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return { connected: true, latencyMs: Date.now() - start };
      } catch {
        return { connected: false, latencyMs: 0 };
      }
    })(),
    pingRedis(),
    getMigrationStatus(),
  ]);

  const memory = process.memoryUsage();
  const overallHealthy = database.connected && redis.connected;

  return sendData(res, {
    status: overallHealthy ? "healthy" : "degraded",
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    database,
    redis,
    migrations,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      rssMb: Math.round(memory.rss / 1024 / 1024),
    },
  });
}

export async function listAuditLogs(req: Request, res: Response) {
  const { page, pageSize, businessId, userId, action, entityType, dateFrom, dateTo } = auditLogQuerySchema.parse(
    req.query,
  );

  const where: Prisma.AuditLogWhereInput = {
    ...(businessId ? { businessId } : {}),
    ...(userId ? { userId } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
    ...(entityType ? { entityType } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        business: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, email: true, fullName: true } },
      },
    }),
  ]);

  return sendData(res, logs, 200, paginationMeta(page, pageSize, total));
}

export async function listSessions(req: Request, res: Response) {
  const { page, pageSize, userId, activeOnly } = sessionListQuerySchema.parse(req.query);

  const where: Prisma.SessionWhereInput = {
    ...(userId ? { userId } : {}),
    ...(activeOnly ? { revokedAt: null, expiresAt: { gt: new Date() } } : {}),
  };

  const [total, sessions] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        user: { select: { id: true, email: true, fullName: true } },
      },
    }),
  ]);

  return sendData(res, sessions, 200, paginationMeta(page, pageSize, total));
}

export async function revokeSession(req: Request, res: Response) {
  const { id } = sessionIdParamSchema.parse(req.params);
  const adminId = req.auth!.userId;

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) {
    throw notFound("Session not found");
  }
  if (session.revokedAt) {
    throw conflict("Session is already revoked");
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id }, data: { revokedAt: new Date() } });
    await writeAudit(
      {
        userId: adminId,
        action: "platform.session.revoke",
        entityType: "Session",
        entityId: id,
        metadata: { targetUserId: session.userId },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );
  });

  return sendData(res, { ok: true });
}
