import { renderTemplate } from "@daljir/notifications";
import { z } from "zod";
import type { Request, Response } from "express";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { dispatchNotification } from "./service.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

const sendTestSchema = z.object({
  templateId: z.string().min(1),
  to: z.string().trim().min(3),
  variables: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Manually dispatches a notification for a given template, exercising the
 * exact same logging pipeline (`dispatchNotification`) used by the worker.
 * Useful for verifying provider configuration and template rendering
 * without waiting on the scheduler.
 */
export async function sendTestNotification(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = sendTestSchema.parse(req.body);

  const template = await prisma.notificationTemplate.findFirst({
    where: { id: input.templateId, businessId: tenant.businessId },
  });
  if (!template) {
    throw notFound("Notification template not found");
  }

  const body = renderTemplate(template.body, input.variables);
  const subject = template.subject ? renderTemplate(template.subject, input.variables) : null;

  const result = await dispatchNotification({
    businessId: tenant.businessId,
    channel: template.channel,
    to: input.to,
    subject,
    content: body,
    title: template.key,
    userId: auth.userId,
    templateId: template.id,
  });

  return sendData(res, result, 201);
}
