import nodemailer from "nodemailer";
import { env } from "../../env.js";
import { logger } from "../../lib/logger.js";
import { maskRecipient } from "../../lib/mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/** SMTP email driver via nodemailer. Mirrors the API module's driver. */
export function createEmailDriver(): NotificationChannelDriver {
  return {
    channel: "EMAIL",
    provider: "smtp",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL } = env;
      if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
        return { status: "FAILED", provider: "smtp", errorMessage: "Email provider is not configured" };
      }
      try {
        const transport = nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT ?? 587,
          secure: (SMTP_PORT ?? 587) === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        });
        const info = await transport.sendMail({
          from: SMTP_FROM_EMAIL ?? SMTP_USER,
          to: input.to,
          subject: input.subject ?? "Notification",
          text: input.content,
        });
        return { status: "SENT", provider: "smtp", providerMessageId: info.messageId ?? null };
      } catch (error) {
        logger.error("Email send failed", {
          businessId: input.businessId,
          recipient: maskRecipient(input.to),
          error: error instanceof Error ? error.message : "unknown error",
        });
        return { status: "FAILED", provider: "smtp", errorMessage: "Email provider request failed" };
      }
    },
  };
}
