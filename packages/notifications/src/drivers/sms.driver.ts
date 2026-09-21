import type { NotificationsLogger } from "../logger.js";
import { maskRecipient } from "../mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

export type SmsDriverConfig = {
  apiUrl: string;
  apiKey: string;
  senderId?: string;
};

/**
 * Generic SMS gateway driver (works with most REST-based SMS aggregators
 * common in the Somali/East-African market). Configuration is injected
 * explicitly (dependency injection) rather than read from `process.env`.
 */
export function createSmsDriver(config: SmsDriverConfig, logger: NotificationsLogger): NotificationChannelDriver {
  return {
    channel: "SMS",
    provider: "sms",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const { apiUrl, apiKey, senderId } = config;
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            to: input.to,
            from: senderId,
            message: input.content,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { id?: string } | null;
        if (!response.ok) {
          return { status: "FAILED", provider: "sms", errorMessage: `SMS provider responded with status ${response.status}` };
        }
        return { status: "SENT", provider: "sms", providerMessageId: payload?.id ?? null };
      } catch (error) {
        logger.error("SMS send failed", {
          businessId: input.businessId,
          recipient: maskRecipient(input.to),
          error: error instanceof Error ? error.message : "unknown error",
        });
        return { status: "FAILED", provider: "sms", errorMessage: "SMS provider request failed" };
      }
    },
  };
}
