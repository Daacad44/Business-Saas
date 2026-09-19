import { PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG } from "./rbac.js";

const prisma = new PrismaClient();

async function main() {
  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        family: permission.family,
        description: permission.description,
      },
      create: permission,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
