import { createConnection } from "node:net";
import { env } from "../../lib/env.js";

const PING_TIMEOUT_MS = 1500;

function parseRedisUrl(rawUrl: string): { host: string; port: number } {
  const url = new URL(rawUrl);
  return {
    host: url.hostname || "localhost",
    port: url.port ? Number(url.port) : 6379,
  };
}

/**
 * Liveness check using a raw RESP PING over TCP. Avoids adding a Redis
 * client dependency for a single health check, and never logs or returns
 * the connection string.
 */
export function pingRedis(): Promise<{ connected: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;

    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ connected, latencyMs: Date.now() - start });
    };

    let host: string;
    let port: number;
    try {
      ({ host, port } = parseRedisUrl(env.REDIS_URL));
    } catch {
      finish(false);
      return;
    }

    const socket = createConnection({ host, port });

    socket.setTimeout(PING_TIMEOUT_MS);

    socket.once("connect", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });

    socket.once("data", (chunk) => {
      const reply = chunk.toString("utf8");
      socket.end();
      finish(reply.startsWith("+PONG"));
    });

    socket.once("timeout", () => {
      socket.destroy();
      finish(false);
    });

    socket.once("error", () => {
      finish(false);
    });
  });
}
