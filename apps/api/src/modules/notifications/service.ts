import { createNotificationsService, type DriversConfig } from "@daljir/notifications";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { notificationEnv } from "./env.js";

/**
 * The single canonical notifications implementation lives in
 * `@daljir/notifications`. This file only wires it up with THIS app's
 * Prisma client, logger, and env-derived provider configuration
 * (dependency injection) — `apps/worker` wires the same package
 * independently with its own env schema in `apps/worker/src/lib/notifications.ts`.
 */
const drivers: DriversConfig = {
  ...(notificationEnv.WHATSAPP_API_URL && notificationEnv.WHATSAPP_API_TOKEN
    ? {
        whatsapp: {
          apiUrl: notificationEnv.WHATSAPP_API_URL,
          apiToken: notificationEnv.WHATSAPP_API_TOKEN,
          fromPhoneId: notificationEnv.WHATSAPP_FROM_PHONE_ID,
        },
      }
    : {}),
  ...(notificationEnv.SMS_API_URL && notificationEnv.SMS_API_KEY
    ? {
        sms: {
          apiUrl: notificationEnv.SMS_API_URL,
          apiKey: notificationEnv.SMS_API_KEY,
          senderId: notificationEnv.SMS_SENDER_ID,
        },
      }
    : {}),
  ...(notificationEnv.SMTP_HOST && notificationEnv.SMTP_USER && notificationEnv.SMTP_PASSWORD
    ? {
        smtp: {
          host: notificationEnv.SMTP_HOST,
          port: notificationEnv.SMTP_PORT,
          user: notificationEnv.SMTP_USER,
          password: notificationEnv.SMTP_PASSWORD,
          fromEmail: notificationEnv.SMTP_FROM_EMAIL,
        },
      }
    : {}),
};

const notificationsService = createNotificationsService({
  prisma,
  logger,
  drivers,
  maxRetries: notificationEnv.NOTIFICATION_MAX_RETRIES,
  // Matches the previous hardcoded default in this app's dispatch service.
  retryBaseMs: 200,
});

export const dispatchNotification = notificationsService.dispatchNotification;
export const resolveDriver = notificationsService.resolveDriver;
