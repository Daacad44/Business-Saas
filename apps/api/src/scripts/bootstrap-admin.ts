import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { AdminBootstrapError, bootstrapPlatformAdmin } = await import("../modules/admin/bootstrap-admin.js");
const { prisma } = await import("../lib/prisma.js");

try {
  const result = await bootstrapPlatformAdmin(process.env);
  console.log(
    `Platform admin ${result.action}: email=${result.email} platformRole=${result.platformRole} status=${result.status}`,
  );
} catch (error) {
  const message =
    error instanceof AdminBootstrapError || error instanceof Error
      ? error.message
      : "Platform admin bootstrap failed";
  console.error(message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
