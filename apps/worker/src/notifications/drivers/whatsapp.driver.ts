import { env } from "../../env.js";
import { logger } from "../../lib/logger.js";
import { maskRecipient } from "../../lib/mask.js";
import type { ChannelSendInput, ChannelSendResult, NotificationChannelDriver } from "./types.js";

/** Generic WhatsApp Business Cloud API-style driver. Mirrors the API module's driver. */
export function createWhatsAppDriver(): NotificationChannelDriver {
  return {
    channel: "WHATSAPP",
    provider: "whatsapp",
    async send(input: ChannelSendInput): Promise<ChannelSendResult> {
      const url = env.WHATSAPP_API_URL;
      const token = env.WHATSAPP_API_TOKEN;
      if (!url || !token) {
        return { status: "FAILED", provider: "whatsapp", errorMessage: "WhatsApp provider is not configured" };
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: input.to,
            from: env.WHATSAPP_FROM_PHONE_ID,
            type: "text",
            text: { body: input.content },
          }),
        });
        const payload = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
        if (!response.ok) {
          return { status: "FAILED", provider: "whatsapp", errorMessage: `WhatsApp provider responded with status ${response.status}` };
        }
        return { status: "SENT", provider: "whatsapp", providerMessageId: payload?.messages?.[0]?.id ?? null };
      } catch (error) {
        logger.error("WhatsApp send failed", {
          businessId: input.businessId,
          recipient: maskRecipient(input.to),
          error: error instanceof Error ? error.message : "unknown error",
        });
        return { status: "FAILED", provider: "whatsapp", errorMessage: "WhatsApp provider request failed" };
      }
    },
  };
}
