import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../lib/prisma.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "../../../../../prisma/migrations");

type AppliedMigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export type MigrationStatus = {
  appliedCount: number;
  pendingCount: number;
  lastMigration: string | null;
  lastAppliedAt: string | null;
  checkAvailable: boolean;
};

function listLocalMigrationNames(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
  const localMigrations = listLocalMigrationNames();

  try {
    const rows = await prisma.$queryRaw<AppliedMigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `;

    const appliedNames = new Set(
      rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name),
    );

    const lastApplied = rows
      .filter((row) => row.finished_at && !row.rolled_back_at)
      .sort((a, b) => (a.finished_at! < b.finished_at! ? 1 : -1))[0];

    const pendingCount = localMigrations.filter((name) => !appliedNames.has(name)).length;

    return {
      appliedCount: appliedNames.size,
      pendingCount,
      lastMigration: lastApplied?.migration_name ?? null,
      lastAppliedAt: lastApplied?.finished_at?.toISOString() ?? null,
      checkAvailable: true,
    };
  } catch {
    return {
      appliedCount: 0,
      pendingCount: localMigrations.length,
      lastMigration: null,
      lastAppliedAt: null,
      checkAvailable: false,
    };
  }
}
