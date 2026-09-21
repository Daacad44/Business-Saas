import type { NotificationChannel } from "@prisma/client";
import { maskRecipient } from "../../lib/mask.js";
import { logger } from "../../lib/logger.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/**
 * Safe default driver used whenever provider credentials are absent. Logs
 * that a message WOULD have been sent (recipient masked, no message body
 * or secrets) and reports QUEUED — nothing is actually transmitted. This
 * lets the worker run end-to-end in dev/CI with zero provider config.
 */
export function createNoopDriver(channel: NotificationChannel): NotificationChannelDriver {
  return {
    channel,
    provider: "noop",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      logger.info(`(noop driver) would send ${channel}`, {
        businessId: input.businessId,
        recipient: maskRecipient(input.to),
      });
      return { status: "QUEUED", provider: "noop", providerMessageId: null, errorMessage: null };
    },
  };
}
