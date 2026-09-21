import { notificationEnv } from "../env.js";
import { maskRecipient } from "../mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/**
 * Generic SMS gateway driver (works with most REST-based SMS aggregators
 * common in the Somali/East-African market). Configured via optional env
 * vars only; never constructed unless `isSmsConfigured` is true.
 */
export function createSmsDriver(): NotificationChannelDriver {
  return {
    channel: "SMS",
    provider: "sms",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const url = notificationEnv.SMS_API_URL;
      const apiKey = notificationEnv.SMS_API_KEY;
      if (!url || !apiKey) {
        return { status: "FAILED", provider: "sms", errorMessage: "SMS provider is not configured" };
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            to: input.to,
            from: notificationEnv.SMS_SENDER_ID,
            message: input.content,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { id?: string } | null;
        if (!response.ok) {
          return { status: "FAILED", provider: "sms", errorMessage: `SMS provider responded with status ${response.status}` };
        }
        return { status: "SENT", provider: "sms", providerMessageId: payload?.id ?? null };
      } catch (error) {
        console.error(
          `[notifications] SMS send failed for ${maskRecipient(input.to)}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        return { status: "FAILED", provider: "sms", errorMessage: "SMS provider request failed" };
      }
    },
  };
}
