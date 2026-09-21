import { env } from "../../env.js";
import { logger } from "../../lib/logger.js";
import { maskRecipient } from "../../lib/mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/** Generic SMS gateway driver. Mirrors the API module's driver. */
export function createSmsDriver(): NotificationChannelDriver {
  return {
    channel: "SMS",
    provider: "sms",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const url = env.SMS_API_URL;
      const apiKey = env.SMS_API_KEY;
      if (!url || !apiKey) {
        return { status: "FAILED", provider: "sms", errorMessage: "SMS provider is not configured" };
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ to: input.to, from: env.SMS_SENDER_ID, message: input.content }),
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
