import { syncReferenceData } from "@daljir/database";
import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  const result = await syncReferenceData(prisma);
  logger.info("Permission catalog synced", {
    catalogSize: result.catalogSize,
    permissionCount: result.permissionCount,
    unknownKeyCount: result.unknownKeys.length,
    systemRoleGrantsAdded: result.systemRoleGrantsAdded,
    rolePermissionCount: result.rolePermissionCount,
  });

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Daljir API listening on ${env.API_ORIGIN}`);
  });
}

main().catch((error: unknown) => {
  logger.error("Fatal: reference data sync failed; refusing to listen", {
    error: error instanceof Error ? error.message : "unknown error",
  });
  console.error(error);
  process.exit(1);
});
