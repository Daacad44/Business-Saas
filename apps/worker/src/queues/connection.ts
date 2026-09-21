import { Redis } from "ioredis";
import { env } from "../env.js";

/**
 * BullMQ requires a Redis connection with `maxRetriesPerRequest: null` for
 * its blocking commands. Fails fast with a clear message if `REDIS_URL`
 * is unreachable rather than silently retrying forever.
 */
export function createRedisConnection(): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on("error", (error: Error) => {
    console.error(`[worker] Redis connection error: ${error.message}`);
  });

  return connection;
}
