import { beforeAll } from "vitest";
import { syncReferenceData } from "@daljir/database";
import { prisma } from "../lib/prisma.js";

beforeAll(async () => {
  await syncReferenceData(prisma);
});
