import { Queue, Worker } from "bullmq";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { createRedisConnection } from "./queues/connection.js";
import {
  DEBT_SCAN_JOB_NAME,
  DEBT_SCAN_SCHEDULER_ID,
  DISPATCH_QUEUE_NAME,
  NOTIFICATION_DISPATCH_JOB_NAME,
  SCHEDULER_QUEUE_NAME,
} from "./queues/names.js";
import { runDebtScan } from "./jobs/debt-scan.job.js";
import { processNotificationDispatchJob } from "./jobs/notification-dispatch.job.js";
import { startHealthServer } from "./health/server.js";
import { registerGracefulShutdown } from "./shutdown.js";

async function main() {
  logger.info("Starting Daljir automation worker", {
    automationScanIntervalMinutes: env.AUTOMATION_SCAN_INTERVAL_MINUTES,
  });

  // A single ioredis connection is shared by both queues/workers; BullMQ
  // requires `maxRetriesPerRequest: null` (set in createRedisConnection).
  const redisConnection = createRedisConnection();

  await new Promise<void>((resolve, reject) => {
    redisConnection.once("ready", () => resolve());
    redisConnection.once("error", (error: Error) => reject(error));
  }).catch((error: unknown) => {
    logger.error("Could not connect to Redis — failing fast", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    process.exit(1);
  });

  const schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, { connection: redisConnection });
  const dispatchQueue = new Queue(DISPATCH_QUEUE_NAME, { connection: redisConnection });

  // Repeatable job: scans due/overdue debts across all businesses.
  await schedulerQueue.upsertJobScheduler(
    DEBT_SCAN_SCHEDULER_ID,
    { every: env.AUTOMATION_SCAN_INTERVAL_MINUTES * 60_000 },
    { name: DEBT_SCAN_JOB_NAME, data: {} },
  );

  const schedulerWorker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async (job) => {
      if (job.name !== DEBT_SCAN_JOB_NAME) return;
      logger.info("Running debt scan", { jobId: job.id });
      const result = await runDebtScan(async (executionId) => {
        await dispatchQueue.add(
          NOTIFICATION_DISPATCH_JOB_NAME,
          { executionId },
          { jobId: executionId, attempts: 1 },
        );
      });
      logger.info("Debt scan job finished", { jobId: job.id, ...result });
      return result;
    },
    { connection: redisConnection, concurrency: 1 },
  );

  const dispatchWorker = new Worker(
    DISPATCH_QUEUE_NAME,
    async (job) => {
      logger.info("Processing notification dispatch job", { jobId: job.id, executionId: job.data.executionId });
      return processNotificationDispatchJob(job.data);
    },
    { connection: redisConnection, concurrency: 5 },
  );

  schedulerWorker.on("failed", (job, error) => {
    logger.error("Scheduler job failed", { jobId: job?.id, error: error.message });
  });
  dispatchWorker.on("failed", (job, error) => {
    logger.error("Dispatch job failed", { jobId: job?.id, executionId: job?.data?.executionId, error: error.message });
  });

  const healthServer = startHealthServer({ prisma, redis: redisConnection });

  registerGracefulShutdown({
    workers: [schedulerWorker, dispatchWorker],
    queues: [schedulerQueue, dispatchQueue],
    redisConnections: [redisConnection],
    prisma,
    healthServer,
  });

  logger.info("Worker is running", {
    queues: [SCHEDULER_QUEUE_NAME, DISPATCH_QUEUE_NAME],
  });
}

main().catch((error) => {
  logger.error("Fatal error starting worker", { error: error instanceof Error ? error.message : "unknown error" });
  process.exit(1);
});
