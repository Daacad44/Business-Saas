import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

console.log("Daljir worker stub (Phase 1). Job processing starts in Phase 5.");
console.log(`Configured Redis URL: ${redisUrl.replace(/:[^:@/]+@/, ":***@")}`);

setInterval(() => {
  // Keep the process alive for `pnpm dev` without consuming jobs yet.
}, 60_000);
