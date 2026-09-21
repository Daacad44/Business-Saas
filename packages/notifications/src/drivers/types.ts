import type { MessageDeliveryStatus, NotificationChannel } from "@prisma/client";

export type ChannelSendInput = {
  businessId: string;
  to: string;
  subject?: string | null;
  content: string;
};

export type ChannelSendResult = {
  status: MessageDeliveryStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  provider: string;
};

export interface NotificationChannelDriver {
  readonly channel: NotificationChannel;
  readonly provider: string;
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
}
