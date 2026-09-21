import type { MessageDeliveryStatus, NotificationChannel, NotificationStatus, Prisma, PrismaClient } from "@prisma/client";
import { resolveDriver, type DriversConfig } from "./drivers/index.js";
import type { ChannelSendResult, NotificationChannelDriver } from "./drivers/types.js";
import type { NotificationsLogger } from "./logger.js";

export type DispatchDeps = {
  prisma: PrismaClient;
  logger: NotificationsLogger;
  drivers: DriversConfig;
  /** Default max attempt count (each app's `NOTIFICATION_MAX_RETRIES`). */
  maxRetries: number;
  /** Default exponential-backoff base delay (ms). Each app injects its own default. */
  retryBaseMs: number;
};

export type DispatchInput = {
  businessId: string;
  channel: NotificationChannel;
  to: string;
  subject?: string | null;
  content: string;
  title?: string | null;
  customerId?: string | null;
  userId?: string | null;
  templateId?: string | null;
  executionId?: string | null;
  /** Overrides the exponential-backoff base delay (ms). Kept small by default for tests. */
  retryBaseMs?: number;
  /** Overrides the max attempt count. Defaults to the injected `maxRetries`. */
  maxAttempts?: number;
  /** Test-only hook to inject a fake driver instead of resolving one from config. */
  driver?: NotificationChannelDriver;
};

export type DispatchResult = {
  notificationId: string;
  status: NotificationStatus;
  attempts: number;
  provider: string;
  providerMessageId: string | null;
};

function mapNotificationStatus(deliveryStatus: MessageDeliveryStatus): NotificationStatus {
  switch (deliveryStatus) {
    case "DELIVERED":
      return "DELIVERED";
    case "SENT":
    case "QUEUED":
      return "SENT";
    case "FAILED":
    case "UNDELIVERED":
    default:
      return "FAILED";
  }
}

async function createChannelMessageRow(
  tx: Prisma.TransactionClient,
  channel: NotificationChannel,
  businessId: string,
  notificationId: string,
  to: string,
  content: string,
  subject: string | null | undefined,
): Promise<{ id: string } | null> {
  switch (channel) {
    case "WHATSAPP":
      return tx.whatsAppMessage.create({
        data: { businessId, notificationId, toPhone: to, content, status: "QUEUED" },
        select: { id: true },
      });
    case "SMS":
      return tx.sMSMessage.create({
        data: { businessId, notificationId, toPhone: to, content, status: "QUEUED" },
        select: { id: true },
      });
    case "EMAIL":
      return tx.emailMessage.create({
        data: { businessId, notificationId, toEmail: to, content, subject: subject ?? null, status: "QUEUED" },
        select: { id: true },
      });
    case "IN_APP":
    default:
      return null;
  }
}

async function updateChannelMessageRow(
  tx: Prisma.TransactionClient,
  channel: NotificationChannel,
  messageId: string | null,
  result: ChannelSendResult,
) {
  if (!messageId) return;
  const data = {
    status: result.status,
    providerMessageId: result.providerMessageId ?? null,
    errorMessage: result.errorMessage ?? null,
    sentAt: result.status === "SENT" || result.status === "DELIVERED" ? new Date() : undefined,
    deliveredAt: result.status === "DELIVERED" ? new Date() : undefined,
  };
  switch (channel) {
    case "WHATSAPP":
      await tx.whatsAppMessage.update({ where: { id: messageId }, data });
      return;
    case "SMS":
      await tx.sMSMessage.update({ where: { id: messageId }, data });
      return;
    case "EMAIL":
      await tx.emailMessage.update({ where: { id: messageId }, data });
      return;
    default:
      return;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalSuccess(status: MessageDeliveryStatus, provider: string) {
  if (status === "DELIVERED" || status === "SENT") return true;
  // The no-op driver reports QUEUED to mean "accepted, nothing to retry".
  if (status === "QUEUED" && provider === "noop") return true;
  return false;
}

/**
 * Creates a `dispatchNotification` function bound to one app's Prisma
 * client, logger, and driver configuration (dependency injection — this
 * package never reads `process.env` or owns a Prisma client directly,
 * since `apps/api` and `apps/worker` have separate env schemas and Prisma
 * client instances).
 *
 * Every attempt is logged: a `Notification` + initial `NotificationLog` +
 * channel-specific message row are created BEFORE any provider call is
 * made, and every subsequent attempt appends another `NotificationLog`
 * row. There is no code path that can send without first writing these
 * rows (CLAUDE.md rule 9). Failures are retried with exponential backoff
 * up to `maxAttempts`, after which the notification is marked FAILED
 * (terminal state) rather than silently swallowed.
 *
 * This is the single canonical implementation shared by the API (manual
 * "send test" endpoint) and the worker (automation dispatch queue) —
 * previously two structurally-identical copies existed, one per app.
 */
export function createDispatchNotification(deps: DispatchDeps) {
  const { prisma, logger, drivers, maxRetries, retryBaseMs: defaultRetryBaseMs } = deps;

  return async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
    const maxAttempts = input.maxAttempts ?? maxRetries;
    const retryBaseMs = input.retryBaseMs ?? defaultRetryBaseMs;

    const { notification, channelMessageId } = await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId ?? null,
          userId: input.userId ?? null,
          templateId: input.templateId ?? null,
          executionId: input.executionId ?? null,
          channel: input.channel,
          title: input.title ?? null,
          body: input.content,
          status: "PENDING",
        },
      });

      const channelMessage = await createChannelMessageRow(
        tx,
        input.channel,
        input.businessId,
        notification.id,
        input.to,
        input.content,
        input.subject,
      );

      await tx.notificationLog.create({
        data: {
          businessId: input.businessId,
          notificationId: notification.id,
          channel: input.channel,
          status: "QUEUED",
        },
      });

      return { notification, channelMessageId: channelMessage?.id ?? null };
    });

    const driver = input.driver ?? resolveDriver(input.channel, drivers, logger);
    let attempt = 0;
    let lastResult: ChannelSendResult = {
      status: "FAILED",
      provider: driver.provider,
      errorMessage: "Not attempted",
    };

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        lastResult = await driver.send({
          businessId: input.businessId,
          to: input.to,
          subject: input.subject,
          content: input.content,
        });
      } catch (error) {
        lastResult = {
          status: "FAILED",
          provider: driver.provider,
          errorMessage: error instanceof Error ? error.message : "Unknown driver error",
        };
      }

      await prisma.$transaction(async (tx) => {
        await tx.notificationLog.create({
          data: {
            businessId: input.businessId,
            notificationId: notification.id,
            channel: input.channel,
            provider: lastResult.provider,
            status: lastResult.status,
            providerMessageId: lastResult.providerMessageId ?? null,
            errorMessage: lastResult.errorMessage ?? null,
            deliveredAt: lastResult.status === "DELIVERED" ? new Date() : null,
          },
        });
        await updateChannelMessageRow(tx, input.channel, channelMessageId, lastResult);
      });

      if (isTerminalSuccess(lastResult.status, lastResult.provider)) {
        break;
      }
      if (attempt < maxAttempts) {
        logger.warn("Notification attempt failed, retrying with backoff", {
          businessId: input.businessId,
          attempt,
          maxAttempts,
          notificationId: notification.id,
        });
        await sleep(retryBaseMs * 2 ** (attempt - 1));
      }
    }

    const finalStatus = mapNotificationStatus(lastResult.status);
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: finalStatus,
        sentAt: finalStatus === "SENT" || finalStatus === "DELIVERED" ? new Date() : null,
      },
    });

    return {
      notificationId: updated.id,
      status: updated.status,
      attempts: attempt,
      provider: lastResult.provider,
      providerMessageId: lastResult.providerMessageId ?? null,
    };
  };
}

export type DispatchNotificationFn = ReturnType<typeof createDispatchNotification>;
