import type { NotificationChannel, NotificationStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { buildPageMeta, parsePagination } from "./pagination.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

const VALID_CHANNELS: NotificationChannel[] = ["WHATSAPP", "SMS", "EMAIL", "IN_APP"];
const VALID_STATUSES: NotificationStatus[] = ["PENDING", "SENT", "DELIVERED", "FAILED", "READ"];

export async function listNotifications(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const channel = req.query.channel as string | undefined;
  const status = req.query.status as string | undefined;
  const customerId = req.query.customerId as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const where = {
    businessId: tenant.businessId,
    ...(channel && VALID_CHANNELS.includes(channel as NotificationChannel)
      ? { channel: channel as NotificationChannel }
      : {}),
    ...(status && VALID_STATUSES.includes(status as NotificationStatus)
      ? { status: status as NotificationStatus }
      : {}),
    ...(customerId ? { customerId } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        template: { select: { id: true, key: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return sendData(res, notifications, 200, buildPageMeta(total, pagination));
}

export async function getNotification(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: {
      logs: { orderBy: { createdAt: "asc" } },
      whatsAppMessages: true,
      smsMessages: true,
      emailMessages: true,
      customer: { select: { id: true, fullName: true, phone: true } },
      template: { select: { id: true, key: true } },
    },
  });
  if (!notification) {
    throw notFound("Notification not found");
  }
  return sendData(res, notification);
}

export async function listNotificationLogs(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    select: { id: true },
  });
  if (!notification) {
    throw notFound("Notification not found");
  }
  const pagination = parsePagination(req);
  const where = { businessId: tenant.businessId, notificationId: notification.id };
  const [logs, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.notificationLog.count({ where }),
  ]);
  return sendData(res, logs, 200, buildPageMeta(total, pagination));
}
