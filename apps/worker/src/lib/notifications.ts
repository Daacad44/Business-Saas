import { createNotificationsService, type DriversConfig } from "@daljir/notifications";
import { env } from "../env.js";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";

/**
 * The single canonical notifications implementation lives in
 * `@daljir/notifications`. This file only wires it up with THIS app's
 * Prisma client, logger, and env-derived provider configuration
 * (dependency injection) — `apps/api` wires the same package
 * independently with its own env schema in
 * `apps/api/src/modules/notifications/service.ts`.
 */
const drivers: DriversConfig = {
  ...(env.WHATSAPP_API_URL && env.WHATSAPP_API_TOKEN
    ? {
        whatsapp: {
          apiUrl: env.WHATSAPP_API_URL,
          apiToken: env.WHATSAPP_API_TOKEN,
          fromPhoneId: env.WHATSAPP_FROM_PHONE_ID,
        },
      }
    : {}),
  ...(env.SMS_API_URL && env.SMS_API_KEY
    ? {
        sms: {
          apiUrl: env.SMS_API_URL,
          apiKey: env.SMS_API_KEY,
          senderId: env.SMS_SENDER_ID,
        },
      }
    : {}),
  ...(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD
    ? {
        smtp: {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          fromEmail: env.SMTP_FROM_EMAIL,
        },
      }
    : {}),
};

const notificationsService = createNotificationsService({
  prisma,
  logger,
  drivers,
  maxRetries: env.NOTIFICATION_MAX_RETRIES,
  retryBaseMs: env.NOTIFICATION_RETRY_BASE_MS,
});

export const dispatchNotification = notificationsService.dispatchNotification;
export const resolveDriver = notificationsService.resolveDriver;
