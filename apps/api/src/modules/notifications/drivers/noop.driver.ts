import type { NotificationChannel } from "@prisma/client";
import { maskRecipient } from "../mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/**
 * Safe default driver used whenever provider credentials are absent.
 * Logs that a message WOULD have been sent (recipient masked, no message
 * body or secrets) and reports a QUEUED status — nothing is actually
 * transmitted. This lets the app boot and the automation pipeline run
 * end-to-end in dev/CI with zero provider configuration.
 */
export function createNoopDriver(channel: NotificationChannel): NotificationChannelDriver {
  return {
    channel,
    provider: "noop",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      console.info(
        `[notifications] (noop driver) would send ${channel} to ${maskRecipient(input.to)} for business ${input.businessId}`,
      );
      return { status: "QUEUED", provider: "noop", providerMessageId: null, errorMessage: null };
    },
  };
}
