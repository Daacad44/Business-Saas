import type { NotificationChannel, PrismaClient } from "@prisma/client";
import { createDispatchNotification, type DispatchInput, type DispatchResult } from "./dispatch.js";
import { resolveDriver, type DriversConfig } from "./drivers/index.js";
import type { NotificationChannelDriver } from "./drivers/types.js";
import type { NotificationsLogger } from "./logger.js";

export type NotificationsServiceConfig = {
  prisma: PrismaClient;
  logger: NotificationsLogger;
  drivers: DriversConfig;
  maxRetries: number;
  retryBaseMs: number;
};

export type NotificationsService = {
  dispatchNotification: (input: DispatchInput) => Promise<DispatchResult>;
  resolveDriver: (channel: NotificationChannel) => NotificationChannelDriver;
};

/**
 * Constructs the notifications service for one app. All configuration
 * (Prisma client, logger, provider credentials, retry policy) is injected
 * explicitly by the caller — the package itself never reads `process.env`
 * — because `apps/api` and `apps/worker` each own a separate env schema
 * and a separate Prisma client instance.
 */
export function createNotificationsService(config: NotificationsServiceConfig): NotificationsService {
  const dispatchNotification = createDispatchNotification({
    prisma: config.prisma,
    logger: config.logger,
    drivers: config.drivers,
    maxRetries: config.maxRetries,
    retryBaseMs: config.retryBaseMs,
  });

  return {
    dispatchNotification,
    resolveDriver: (channel) => resolveDriver(channel, config.drivers, config.logger),
  };
}
