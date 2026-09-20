import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { env } from "../../lib/env.js";

export async function getOverview(_req: Request, res: Response) {
  const [businessCount, userCount, branchCount, warehouseCount, auditLogCount] =
    await Promise.all([
      prisma.business.count(),
      prisma.user.count(),
      prisma.branch.count(),
      prisma.warehouse.count(),
      prisma.auditLog.count(),
    ]);

  return sendData(res, {
    businessCount,
    userCount,
    branchCount,
    warehouseCount,
    auditLogCount,
  });
}

export async function listBusinesses(_req: Request, res: Response) {
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          memberships: true,
          branches: true,
          warehouses: true,
        },
      },
    },
  });

  const formatted = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    type: b.type,
    currency: b.currency,
    timezone: b.timezone,
    locale: b.locale,
    createdAt: b.createdAt,
    memberCount: b._count.memberships,
    branchCount: b._count.branches,
    warehouseCount: b._count.warehouses,
  }));

  return sendData(res, formatted);
}

export async function listUsers(_req: Request, res: Response) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      status: true,
      platformRole: true,
      createdAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  const formatted = users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    status: u.status,
    platformRole: u.platformRole,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    membershipCount: u._count.memberships,
  }));

  return sendData(res, formatted);
}

export async function getSystemHealth(_req: Request, res: Response) {
  let dbOk = false;
  let dbLatencyMs = 0;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const memory = process.memoryUsage();

  return sendData(res, {
    status: dbOk ? "healthy" : "degraded",
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      connected: dbOk,
      latencyMs: dbLatencyMs,
    },
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
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  const logs = await prisma.auditLog.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      business: { select: { id: true, name: true, slug: true } },
      user: { select: { id: true, email: true, fullName: true } },
    },
  });

  return sendData(res, logs);
}
