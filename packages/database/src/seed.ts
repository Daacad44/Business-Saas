import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "./seed-demo.js";
import { syncReferenceData } from "./sync-reference.js";

const prisma = new PrismaClient();

/**
 * Local-development convenience used by `prisma migrate dev` (prisma.seed) and
 * `pnpm db:seed`. Production deploy must use `pnpm db:migrate:deploy` (schema
 * + reference catalog only) and must never rely on this command — it also
 * runs the demo seeder.
 */
async function main() {
  const reference = await syncReferenceData(prisma);
  console.log(
    JSON.stringify({
      ok: true,
      message: "Local seed: reference catalog synced",
      permissionCount: reference.permissionCount,
      unknownKeyCount: reference.unknownKeys.length,
    }),
  );
  await seedDemoData(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
