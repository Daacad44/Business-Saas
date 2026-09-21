import { createNotificationTemplateSchema, updateNotificationTemplateSchema } from "@daljir/validation";
import type { NotificationChannel, Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { renderTemplate } from "@daljir/notifications";
import { buildPageMeta, parsePagination } from "./pagination.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

const VALID_CHANNELS: NotificationChannel[] = ["WHATSAPP", "SMS", "EMAIL", "IN_APP"];

export async function listTemplates(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const channel = req.query.channel as string | undefined;
  const isActiveParam = req.query.isActive as string | undefined;

  const where = {
    businessId: tenant.businessId,
    ...(channel && VALID_CHANNELS.includes(channel as NotificationChannel)
      ? { channel: channel as NotificationChannel }
      : {}),
    ...(isActiveParam !== undefined ? { isActive: isActiveParam === "true" } : {}),
  };

  const [templates, total] = await Promise.all([
    prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.notificationTemplate.count({ where }),
  ]);

  return sendData(res, templates, 200, buildPageMeta(total, pagination));
}

export async function getTemplate(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const template = await prisma.notificationTemplate.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!template) {
    throw notFound("Notification template not found");
  }
  return sendData(res, template);
}

export async function createTemplate(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createNotificationTemplateSchema.parse(req.body);

  const exists = await prisma.notificationTemplate.findUnique({
    where: { businessId_key_channel: { businessId: tenant.businessId, key: input.key, channel: input.channel } },
  });
  if (exists) {
    throw conflict("A template with this key already exists for this channel");
  }

  const template = await prisma.notificationTemplate.create({
    data: {
      businessId: tenant.businessId,
      key: input.key,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      variables: input.variables as Prisma.InputJsonValue,
      isActive: input.isActive,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "notification_template.create",
    entityType: "NotificationTemplate",
    entityId: template.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, template, 201);
}

export async function updateTemplate(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateNotificationTemplateSchema.parse(req.body);
  const template = await prisma.notificationTemplate.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!template) {
    throw notFound("Notification template not found");
  }

  const updated = await prisma.notificationTemplate.update({
    where: { id: template.id },
    data: {
      subject: input.subject,
      body: input.body,
      variables: input.variables as Prisma.InputJsonValue | undefined,
      isActive: input.isActive,
      version: input.body !== undefined ? { increment: 1 } : undefined,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "notification_template.update",
    entityType: "NotificationTemplate",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, updated);
}

export async function deleteTemplate(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const template = await prisma.notificationTemplate.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!template) {
    throw notFound("Notification template not found");
  }

  await prisma.notificationTemplate.delete({ where: { id: template.id } });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "notification_template.delete",
    entityType: "NotificationTemplate",
    entityId: template.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, { id: template.id });
}

export async function previewTemplate(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const template = await prisma.notificationTemplate.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!template) {
    throw notFound("Notification template not found");
  }
  const variables = (req.body?.variables ?? {}) as Record<string, unknown>;
  const rendered = {
    subject: template.subject ? renderTemplate(template.subject, variables) : null,
    body: renderTemplate(template.body, variables),
  };
  return sendData(res, rendered);
}
