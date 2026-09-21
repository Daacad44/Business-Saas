import type { NotificationChannel } from "@prisma/client";
import { isEmailConfigured, isSmsConfigured, isWhatsAppConfigured } from "../../env.js";
import { createEmailDriver } from "./email.driver.js";
import { createNoopDriver } from "./noop.driver.js";
import { createSmsDriver } from "./sms.driver.js";
import type { NotificationChannelDriver } from "./types.js";
import { createWhatsAppDriver } from "./whatsapp.driver.js";

export type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/** Resolves the driver for a channel, falling back to the no-op/logging driver. */
export function resolveDriver(channel: NotificationChannel): NotificationChannelDriver {
  switch (channel) {
    case "WHATSAPP":
      return isWhatsAppConfigured ? createWhatsAppDriver() : createNoopDriver("WHATSAPP");
    case "SMS":
      return isSmsConfigured ? createSmsDriver() : createNoopDriver("SMS");
    case "EMAIL":
      return isEmailConfigured ? createEmailDriver() : createNoopDriver("EMAIL");
    case "IN_APP":
    default:
      return createNoopDriver(channel);
  }
}
