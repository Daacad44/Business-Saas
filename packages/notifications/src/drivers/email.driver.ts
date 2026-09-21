import nodemailer from "nodemailer";
import type { NotificationsLogger } from "../logger.js";
import { maskRecipient } from "../mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

export type SmtpDriverConfig = {
  host: string;
  port?: number;
  user: string;
  password: string;
  fromEmail?: string;
};

/**
 * SMTP email driver via nodemailer. Configuration is injected explicitly
 * (dependency injection) rather than read from `process.env`.
 */
export function createEmailDriver(config: SmtpDriverConfig, logger: NotificationsLogger): NotificationChannelDriver {
  return {
    channel: "EMAIL",
    provider: "smtp",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const { host, port, user, password, fromEmail } = config;
      try {
        const transport = nodemailer.createTransport({
          host,
          port: port ?? 587,
          secure: (port ?? 587) === 465,
          auth: { user, pass: password },
        });
        const info = await transport.sendMail({
          from: fromEmail ?? user,
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
