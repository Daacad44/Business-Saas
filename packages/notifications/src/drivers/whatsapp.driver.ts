import type { NotificationsLogger } from "../logger.js";
import { maskRecipient } from "../mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

export type WhatsAppDriverConfig = {
  apiUrl: string;
  apiToken: string;
  fromPhoneId?: string;
};

/**
 * Generic WhatsApp Business Cloud API-style driver. Configuration is
 * injected explicitly (dependency injection) rather than read from
 * `process.env`, since each consuming app owns its own env schema.
 */
export function createWhatsAppDriver(config: WhatsAppDriverConfig, logger: NotificationsLogger): NotificationChannelDriver {
  return {
    channel: "WHATSAPP",
    provider: "whatsapp",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const { apiUrl, apiToken, fromPhoneId } = config;
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: input.to,
            from: fromPhoneId,
            type: "text",
            text: { body: input.content },
          }),
        });
        const payload = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
        if (!response.ok) {
          return {
            status: "FAILED",
            provider: "whatsapp",
            errorMessage: `WhatsApp provider responded with status ${response.status}`,
          };
        }
        return {
          status: "SENT",
          provider: "whatsapp",
          providerMessageId: payload?.messages?.[0]?.id ?? null,
        };
      } catch (error) {
        logger.error("WhatsApp send failed", {
          businessId: input.businessId,
          recipient: maskRecipient(input.to),
          error: error instanceof Error ? error.message : "unknown error",
        });
        return {
          status: "FAILED",
          provider: "whatsapp",
          errorMessage: "WhatsApp provider request failed",
        };
      }
    },
  };
}
