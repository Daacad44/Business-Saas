import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1),

  WORKER_HEALTH_PORT: z.coerce.number().default(4100),
  AUTOMATION_SCAN_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  NOTIFICATION_MAX_RETRIES: z.coerce.number().int().positive().default(3),
  NOTIFICATION_RETRY_BASE_MS: z.coerce.number().int().positive().default(2000),

  // Optional provider config. The worker MUST start with none of these set
  // and fall back to the safe logging no-op driver.
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
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[worker] Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    // Fail fast with a clear message rather than booting into a broken state.
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === "production";

export const isWhatsAppConfigured = Boolean(env.WHATSAPP_API_URL && env.WHATSAPP_API_TOKEN);
export const isSmsConfigured = Boolean(env.SMS_API_URL && env.SMS_API_KEY);
export const isEmailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
