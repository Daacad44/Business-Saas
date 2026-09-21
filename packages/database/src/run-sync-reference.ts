import { PrismaClient } from "@prisma/client";
import { syncReferenceData } from "./sync-reference.js";

const prisma = new PrismaClient();

async function main() {
  const result = await syncReferenceData(prisma);
  console.log(
    JSON.stringify({
      ok: true,
      message: "Reference data synced",
      catalogSize: result.catalogSize,
      permissionCount: result.permissionCount,
      unknownKeyCount: result.unknownKeys.length,
      systemRoleGrantsAdded: result.systemRoleGrantsAdded,
      rolePermissionCount: result.rolePermissionCount,
    }),
  );
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
