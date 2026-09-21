import http from "node:http";
import type { Server } from "node:http";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";

export type HealthDeps = {
  prisma: PrismaClient;
  redis: Redis;
};

/**
 * Minimal HTTP liveness/readiness endpoint so Coolify (or any orchestrator)
 * can health-check the worker process. `/health` returns 200 as soon as
 * the process is up; `/ready` additionally verifies Postgres and Redis
 * connectivity.
 */
export function startHealthServer(deps: HealthDeps): Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/ready") {
      Promise.all([
        deps.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        deps.redis.ping().then(() => true).catch(() => false),
      ])
        .then(([dbOk, redisOk]) => {
          const ok = dbOk && redisOk;
          res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: ok ? "ready" : "not_ready", database: dbOk, redis: redisOk }));
        })
        .catch(() => {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "not_ready" }));
        });
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "daljir-worker" }));
  });

  server.listen(env.WORKER_HEALTH_PORT, () => {
    logger.info(`Worker health server listening on port ${env.WORKER_HEALTH_PORT}`);
  });

  return server;
}
