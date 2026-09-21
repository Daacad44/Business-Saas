import type { Server } from "node:http";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Queue, Worker } from "bullmq";
import { logger } from "./lib/logger.js";

export type ShutdownDeps = {
  workers: Worker[];
  queues: Queue[];
  redisConnections: Redis[];
  prisma: PrismaClient;
  healthServer: Server;
};

let shuttingDown = false;

/** Drains in-flight jobs, then closes queues, Redis, Prisma, and the health server. */
export function registerGracefulShutdown(deps: ShutdownDeps) {
  const handler = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);

    void (async () => {
      try {
        await Promise.all(deps.workers.map((worker) => worker.close()));
        await Promise.all(deps.queues.map((queue) => queue.close()));
        await Promise.all(deps.redisConnections.map((connection) => connection.quit().catch(() => undefined)));
        await deps.prisma.$disconnect();
        await new Promise<void>((resolve) => deps.healthServer.close(() => resolve()));
        logger.info("Shutdown complete");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", { error: error instanceof Error ? error.message : "unknown" });
        process.exit(1);
      }
    })();
  };

  process.on("SIGTERM", () => handler("SIGTERM"));
  process.on("SIGINT", () => handler("SIGINT"));
}
