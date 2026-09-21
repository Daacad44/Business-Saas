import { z } from "zod";

/**
 * Optional notification-provider configuration.
 *
 * Every variable here is OPTIONAL. The application MUST boot and the
 * notification module MUST function (via the logging no-op driver) when
 * none of these are set — this is required for local dev and CI.
 *
 * This mirrors the conventions in `apps/api/src/lib/env.ts` (zod schema,
 * `.env` loaded via dotenv elsewhere in the process) without modifying that
 * shared file, since it is outside this module's ownership.
 */
const notificationEnvSchema = z.object({
  WHATSAPP_API_URL: z.string().url().optional(),
  WHATSAPP_API_TOKEN: z.string().min(1).optional(),
  WHATSAPP_FROM_PHONE_ID: z.string().min(1).optional(),

  SMS_API_URL: z.string().url().optional(),
  SMS_API_KEY: z.string().min(1).optional(),
  SMS_SENDER_ID: z.string().min(1).optional(),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),

  NOTIFICATION_MAX_RETRIES: z.coerce.number().int().positive().default(3),
});

const parsed = notificationEnvSchema.safeParse(process.env);

export const notificationEnv = parsed.success
  ? parsed.data
  : notificationEnvSchema.parse({});

export const isWhatsAppConfigured = Boolean(
  notificationEnv.WHATSAPP_API_URL && notificationEnv.WHATSAPP_API_TOKEN,
);
export const isSmsConfigured = Boolean(notificationEnv.SMS_API_URL && notificationEnv.SMS_API_KEY);
export const isEmailConfigured = Boolean(
  notificationEnv.SMTP_HOST && notificationEnv.SMTP_USER && notificationEnv.SMTP_PASSWORD,
);
