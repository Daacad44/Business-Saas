import { PrismaClient } from "@prisma/client";

/**
 * Dev-only sample/demo seed.
 *
 * Production MUST NOT run this command. Catalog rows the app cannot authorize
 * without live in `sync-reference.ts` and are applied by `pnpm db:sync-reference`
 * / `pnpm db:migrate:deploy` / API startup.
 *
 * Current contents (read from this tree, not guessed): there are no demo users,
 * businesses, products, sales, or other tenant sample rows. The previous
 * `seed.ts` only upserted `PERMISSION_CATALOG`. This file exists so demo data
 * cannot be mixed back into the production sync path.
 */
export async function seedDemoData(_client: PrismaClient): Promise<{ demoRowsInserted: number }> {
  console.log(
    JSON.stringify({
      ok: true,
      message: "Demo seed is a no-op: this tree defines no sample tenant data",
      demoRowsInserted: 0,
    }),
  );
  return { demoRowsInserted: 0 };
}

const invokedDirectly =
  process.argv[1]?.endsWith("seed-demo.ts") || process.argv[1]?.endsWith("seed-demo.js");

if (invokedDirectly) {
  const prisma = new PrismaClient();
  seedDemoData(prisma)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
