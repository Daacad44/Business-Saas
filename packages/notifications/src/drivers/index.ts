import type { NotificationChannel } from "@prisma/client";
import type { NotificationsLogger } from "../logger.js";
import { createEmailDriver, type SmtpDriverConfig } from "./email.driver.js";
import { createNoopDriver } from "./noop.driver.js";
import { createSmsDriver, type SmsDriverConfig } from "./sms.driver.js";
import { createWhatsAppDriver, type WhatsAppDriverConfig } from "./whatsapp.driver.js";

export type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";
export type { WhatsAppDriverConfig } from "./whatsapp.driver.js";
export type { SmsDriverConfig } from "./sms.driver.js";
export type { SmtpDriverConfig } from "./email.driver.js";

export type DriversConfig = {
  whatsapp?: WhatsAppDriverConfig;
  sms?: SmsDriverConfig;
  smtp?: SmtpDriverConfig;
};

export function isWhatsAppConfigured(config: DriversConfig): boolean {
  return Boolean(config.whatsapp?.apiUrl && config.whatsapp?.apiToken);
}

export function isSmsConfigured(config: DriversConfig): boolean {
  return Boolean(config.sms?.apiUrl && config.sms?.apiKey);
}

export function isEmailConfigured(config: DriversConfig): boolean {
  return Boolean(config.smtp?.host && config.smtp?.user && config.smtp?.password);
}

/**
 * Resolves the driver to use for a given channel. Falls back to the safe
 * no-op/logging driver whenever provider credentials are absent, so the app
 * always boots and the automation pipeline always runs in dev/CI.
 */
export function resolveDriver(
  channel: NotificationChannel,
  config: DriversConfig,
  logger: NotificationsLogger,
): import("./types.js").NotificationChannelDriver {
  switch (channel) {
    case "WHATSAPP":
      return isWhatsAppConfigured(config) ? createWhatsAppDriver(config.whatsapp!, logger) : createNoopDriver(channel, logger);
    case "SMS":
      return isSmsConfigured(config) ? createSmsDriver(config.sms!, logger) : createNoopDriver(channel, logger);
    case "EMAIL":
      return isEmailConfigured(config) ? createEmailDriver(config.smtp!, logger) : createNoopDriver(channel, logger);
    case "IN_APP":
    default:
      return createNoopDriver(channel, logger);
  }
}
