import nodemailer from "nodemailer";
import { notificationEnv } from "../env.js";
import { maskRecipient } from "../mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/**
 * SMTP email driver via nodemailer. Configured via optional env vars only;
 * never constructed unless `isEmailConfigured` is true.
 */
export function createEmailDriver(): NotificationChannelDriver {
  return {
    channel: "EMAIL",
    provider: "smtp",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL } = notificationEnv;
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
        console.error(
          `[notifications] Email send failed for ${maskRecipient(input.to)}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        return { status: "FAILED", provider: "smtp", errorMessage: "Email provider request failed" };
      }
    },
  };
}
