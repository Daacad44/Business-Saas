# Migration Rollback & Safety Runbook

Owner: Database / Prisma Engineer (`packages/database/`)

This runbook governs how schema changes are proposed, deployed, verified, and — if
necessary — safely reversed for the Daljir Business Platform database. It exists
because Prisma Migrate has **no native "down" migration or automatic rollback
command** for production databases. Every "rollback" here is a deliberate,
reviewed, forward-only compensating migration — never a destructive reset.

> **Never run `prisma migrate reset` against a staging or production database.**
> That command drops the entire database (or all tables) and replays migrations
> from scratch, discarding all data. It is a local-development-only tool. This
> runbook exists specifically so we never need it outside a developer's own
> throwaway database.

---

## 1. Zero-Downtime, Additive Migration Philosophy

All schema changes to `prisma/schema.prisma` must be designed so that the
**previous** and **new** application code can both run correctly against the
database at every point during a rolling deployment. This is achieved through
purely additive, backward-compatible migrations, applied in small, reversible
steps.

### 1.1 Core rules

1. **Never drop a column/table in the same migration that removes its usage
   from code.** Deploys are not atomic across app + database; there is always a
   window where old code is still running against the new schema (and vice
   versa during rollback of the app tier).
2. **Additive first, destructive later, and only after a bake period.**
   The standard pattern for any breaking change is a three-phase rollout,
   each shipped as its own migration + deploy:

   | Phase | Migration | App behavior |
   |---|---|---|
   | 1. Expand | Add new column/table/enum value as **nullable** or with a **default**. Add new indexes `CONCURRENTLY`. | Old code ignores the new column. New code (if deployed) writes to both old and new. |
   | 2. Migrate & Dual-write | Backfill data (batched, idempotent script — not inline in the migration file for large tables). App writes to both old and new fields; reads prefer new, fall back to old. | Both schemas are populated and consistent. |
   | 3. Contract | After a bake period (minimum one full deploy cycle with no rollback need, confirmed in production), drop the old column/table/enum value in a dedicated migration. | Only new code paths remain. |

3. **Never rename a column or table directly.** A rename is a drop + add to
   Postgres and to Prisma's diffing engine. Instead: add the new column, dual
   write/backfill, cut reads over, then drop the old column in Phase 3.
4. **New required (`NOT NULL`) columns must ship in two steps:**
   add as nullable with a backfill, then a separate migration adds the
   `NOT NULL` constraint once every row is populated. Adding `NOT NULL` on a
   large table locks it — prefer `NOT NULL` with a `CHECK` constraint added
   `NOT VALID` then `VALIDATE CONSTRAINT` to avoid a full table scan lock.
5. **Indexes on large tables must be created with `CREATE INDEX CONCURRENTLY`**
   (edit the generated migration SQL — Prisma does not do this by default) to
   avoid taking a write lock on the table.
6. **Enum value removal is never additive.** Removing a Postgres enum value
   requires recreating the enum type. Treat enum value removal as a Phase 3
   contract step only, after confirming (via `query_logs`/application metrics)
   that no row uses the old value and no code path can write it.
7. **Every migration must be reviewed for lock behavior** before merging.
   Run `EXPLAIN` mentally or literally against a staging clone for any
   `ALTER TABLE` on a table with production-scale row counts (notably `Stock`,
   `StockMovement`, `Sale`, `SaleItem`, `Invoice`, `Payment`,
   `FinancialTransaction`).
8. **Financial and inventory tables never lose auditability mid-migration.**
   Per the platform's non-negotiable rules, stock mutations must always carry a
   `StockMovement` record and debt must always trace to an invoice/outstanding
   balance. Migrations touching these tables must preserve that invariant at
   every intermediate phase — never leave a window where the constraint is
   silently unenforced.

### 1.2 Multi-tenant isolation during migration

Every migration must preserve tenant (Business) isolation. When backfilling or
altering tenant-scoped tables, operations must be scoped or batched by
`businessId` where feasible, and any backfill script must be idempotent and
safe to re-run (rules #1 and #8 in `CLAUDE.md`).

---

## 2. Pre-Migration Backup Procedures

No migration is applied to a shared environment (staging or production)
without a fresh, verified backup immediately beforehand.

### 2.1 Required backup before every deploy

```bash
# 1. Identify target environment and confirm DATABASE_URL points at it
echo "$DATABASE_URL" | sed -E 's#(://[^:]+):[^@]+@#\1:*****@#'

# 2. Take a timestamped logical backup (custom format = restorable + compressible)
TS=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="backups/pre-migration-${TS}.dump"

# 3. Verify the dump is non-empty and structurally valid before proceeding
pg_restore --list "backups/pre-migration-${TS}.dump" | head -20
```

### 2.2 Managed Postgres providers

If the production database is hosted on a managed provider (Neon, Supabase,
RDS, etc.), additionally:

- Trigger/confirm a **provider-native snapshot or branch** immediately before
  migration (e.g. a Neon branch off the current head, or an RDS manual
  snapshot). Provider snapshots restore faster than `pg_restore` for large
  databases and are the primary recovery path; the `pg_dump` above is the
  portable fallback and audit artifact.
- Record the snapshot/branch identifier in the migration's PR description or
  deployment ticket so it can be located quickly during an incident.

### 2.3 Backup retention and storage

- Store dump files outside the application host (object storage / backup
  bucket), never only on the deploying machine's local disk.
- Retain at minimum the last 5 pre-migration backups per environment, and any
  backup taken immediately before a migration that later required rollback,
  for at least 30 days.
- Never commit backup dumps to git. `backups/` must remain gitignored.

### 2.4 Backup verification

A backup is not "done" until it has been proven restorable:

```bash
# Restore into a throwaway verification database, not into staging/production
createdb daljir_backup_verify
pg_restore --dbname=daljir_backup_verify "backups/pre-migration-${TS}.dump"
psql daljir_backup_verify -c "select count(*) from \"Business\";"
dropdb daljir_backup_verify
```

Skip this step only for low-risk, purely additive migrations (new nullable
column, new table) where the blast radius of a bad backup is negligible; it is
mandatory for any migration in Phase 3 (contract/destructive) of the rollout
pattern in Section 1, and for any migration touching financial or inventory
tables.

---

## 3. Disaster Recovery & Compensating Down-Migrations

Prisma Migrate is forward-only: there is no `prisma migrate down`. Recovery
from a bad migration uses one of two paths, chosen by severity.

### 3.1 Decision tree

```
Migration applied and causing problems?
├─ Data loss or corruption already occurred
│   └─ Path A: Restore from pre-migration backup (Section 2)
├─ Schema change is broken/undesired but no destructive data loss yet
│   └─ Path B: Write and ship a compensating "down" migration
└─ Migration failed mid-apply (partial application)
    └─ Path C: Resolve migration state, then apply a fix-forward migration
```

**`prisma migrate reset` is not a valid option in any branch of this tree** for
staging or production. It is excluded entirely from this runbook's recovery
paths.

### 3.2 Path A — Restore from backup (data loss / corruption)

Use when the migration has already destroyed or corrupted data that cannot be
reconstructed (e.g. a dropped column with no source of truth elsewhere, a bad
backfill that overwrote correct values).

1. Freeze writes: put the application into maintenance mode or scale API
   workers to zero so nothing writes to the database during recovery.
2. Restore the pre-migration backup (Section 2) into a **new** database
   instance/branch — never restore over the live database in place until the
   restored copy is verified.
3. Verify the restored copy: row counts on key tables, spot-check recent
   `Sale`, `Invoice`, `Payment`, and `StockMovement` records against
   application logs to confirm no in-flight transactions are missing that
   customers already saw confirmed.
4. Reconcile the gap: any transaction that occurred between the backup
   timestamp and the incident must be re-applied or manually re-entered from
   application logs / audit trail before cutting traffic back over. This is
   mandatory for financial and inventory tables — per platform rules, stock
   and debt records must remain fully auditable.
5. Cut the application's `DATABASE_URL` over to the restored instance (or
   restore in place if using a provider that supports point-in-time
   restore-in-place, e.g. Neon branch reset / RDS PITR).
6. Run `prisma migrate status` (Section 4) against the restored database to
   confirm migration history is consistent before resuming writes.
7. Un-freeze the application.
8. Write an incident postmortem: root cause, why the backup/verification step
   didn't catch it earlier, and a follow-up action to close the gap in this
   runbook or in CI checks.

### 3.3 Path B — Compensating down-migration (schema-only issue, no data loss)

Use when the applied migration's schema is wrong or undesired, but data is
intact. This is the preferred path whenever possible — it avoids the risk and
downtime of a full restore.

1. **Do not edit or delete the already-applied migration file.** Prisma
   tracks applied migrations by checksum in `_prisma_migrations`; editing a
   migration after it has run in any shared environment breaks
   `prisma migrate status` there and causes drift.
2. Author a **new** migration that reverses the effect of the bad one:

   ```bash
   cd packages/database
   npx prisma migrate dev --create-only --name revert_<bad_migration_name> \
     --schema ../../prisma/schema.prisma
   ```

3. Hand-edit the generated (empty) `migration.sql` to perform the exact
   inverse operation. Common cases:

   | Bad migration did | Compensating migration does |
   |---|---|
   | Added a column | `ALTER TABLE ... DROP COLUMN ...` (only if confirmed no data was written that must be preserved) |
   | Dropped a column | Re-add the column; if data is unrecoverable from the live table, restore values from the pre-migration backup dump via a one-off `COPY`/`INSERT ... SELECT` against a temporarily-restored backup schema |
   | Added a `NOT NULL` constraint that breaks writes | `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL` |
   | Added a bad index | `DROP INDEX CONCURRENTLY IF EXISTS ...` |
   | Changed a column type incorrectly | Add a new correctly-typed column, backfill, cut over (treat as a fresh Phase 1→3 cycle, not a raw type revert) |

4. Update `prisma/schema.prisma` to match the reverted state so future
   `prisma migrate dev`/`diff` runs don't try to re-apply the bad change.
5. Test the compensating migration against a staging clone first, exactly as
   any normal migration would be reviewed (Section 1.1 rule #7 on lock
   behavior applies here too).
6. Deploy the compensating migration the same way as any other:
   `pnpm db:migrate:deploy` (i.e. `prisma migrate deploy`) — never
   `migrate dev` in staging/production.

### 3.4 Path C — Partially applied / failed migration

If `prisma migrate deploy` fails mid-way (e.g. connection drop, a genuine SQL
error partway through a multi-statement migration), Prisma marks that
migration as failed in `_prisma_migrations` and blocks further deploys until
resolved.

1. Inspect exactly what portion of the SQL actually committed:

   ```bash
   psql "$DATABASE_URL" -c "select * from _prisma_migrations order by started_at desc limit 5;"
   ```

2. Manually determine, by reading the migration's SQL and the actual table
   state, whether the failed migration's statements were fully, partially, or
   not-at-all applied to the schema.
3. If **not applied**: mark it rolled back so `migrate deploy` can retry it
   cleanly:

   ```bash
   npx prisma migrate resolve --rolled-back <migration_name> \
     --schema ../../prisma/schema.prisma
   ```

4. If **fully applied** despite the reported failure (e.g. the failure was in
   a post-migration check, not the DDL itself): mark it applied instead:

   ```bash
   npx prisma migrate resolve --applied <migration_name> \
     --schema ../../prisma/schema.prisma
   ```

5. If **partially applied**: manually complete or reverse the remaining
   statements by hand via `psql` to reach a consistent state matching either
   "fully applied" or "not applied," then use the matching `resolve` command
   above. Never leave the database in a state that doesn't match one of these
   two outcomes.
6. Re-run `prisma migrate deploy` and confirm with `prisma migrate status`
   (Section 4) that history is clean before resuming normal operations.

---

## 4. Post-Migration Verification

Every migration — forward or compensating — is confirmed successful only after
`prisma migrate status` reports a clean state, plus targeted application
checks.

### 4.1 `prisma migrate status`

```bash
cd packages/database
npx prisma migrate status --schema ../../prisma/schema.prisma
```

Expected healthy output: `Database schema is up to date!` with no entries
under "Following migrations have not yet been applied" and no
"failed migrations" warning. Any other output blocks the deploy from being
considered complete:

- **Pending migrations** → the deploy step did not finish; re-run
  `prisma migrate deploy` (Path C if it previously failed).
- **Failed migration listed** → follow Section 3.4 before proceeding.
- **Drift detected** (schema differs from what migrations describe) → do not
  run `migrate dev` or `db push` against this environment to "fix" it; that
  can silently reset data. Investigate manually via `prisma migrate diff`
  against a scratch database and author a corrective migration.

### 4.2 Application-level smoke checks

After `migrate status` is clean, additionally verify:

1. **`pnpm --filter @daljir/database generate` succeeds deterministically**
   and produces no diff in generated client output across repeated runs (see
   Section 5) — a broken generate means the API/web apps will fail to build
   even though the database itself is healthy.
2. `npx tsc --noEmit` in `packages/database` and any dependent app packages
   passes, confirming the generated Prisma types still satisfy existing
   application code (TypeScript strict mode is non-negotiable per platform
   rules).
3. Spot-check the specific tables/columns touched by the migration with a
   read-only query, confirming shape and a sample of expected values.
4. For migrations touching `Stock`, `StockMovement`, `CustomerDebt`,
   `Payment`, or `FinancialTransaction`: run a reconciliation query confirming
   invariants still hold, e.g. every `Stock` row's quantity is explainable by
   its `StockMovement` history, and every `CustomerDebt` still traces to an
   `Invoice`/outstanding balance.
5. Confirm application error-rate/latency dashboards for the affected service
   are nominal for at least one full traffic cycle before considering the
   migration "safe" (this is what enables the Phase 3 contract step in
   Section 1).

### 4.3 Sign-off checklist

A migration is considered complete and safe to leave unattended only when all
of the following are true:

- [ ] `prisma migrate status` reports a clean, up-to-date schema on every
      environment it was deployed to.
- [ ] Pre-migration backup exists, is stored off-host, and was verified
      restorable (Section 2.4) for any Phase 3/destructive or financial/
      inventory-table migration.
- [ ] `pnpm --filter @daljir/database generate` and `npx tsc --noEmit` both
      pass with no errors.
- [ ] Application smoke checks (Section 4.2) pass in the deployed environment.
- [ ] If this migration was a compensating/rollback migration (Section 3),
      the incident that necessitated it has a written postmortem.
- [ ] Permission catalog is present (`pnpm db:migrate:deploy` includes the
      reference sync). See Section 6. `prisma migrate deploy` alone is not a
      complete production database bring-up.

---

## 5. Deterministic `generate` as a Migration Guardrail

Because `@prisma/client` is generated code, any migration workflow implicitly
depends on `pnpm --filter @daljir/database generate` behaving deterministically
— the same schema must always produce equivalent generated output, and the
command must exit `0` with no drift, regardless of environment. Re-run it after
every schema change (including rollbacks) and after any dependency bump in
`packages/database` (e.g. `@types/node`, `typescript`, `prisma`,
`@prisma/client`) as part of this runbook's verification step, not just as a
one-off developer convenience.

---

## 6. Permission Catalog (Reference Data)

`pnpm db:migrate:deploy` now applies schema migrations **and** the permission
catalog sync. That catalog is not stored in migration SQL (and must not be
added there — existing migration files are immutable). Without it, onboarding
creates an Owner with zero permissions and tenant routes return 403.

Production sequence:

1. `pnpm db:migrate:deploy` (migrations + `syncReferenceData`)
2. Start the API (startup repeats the same sync under `pg_advisory_xact_lock`;
   failure is fatal — the process does not listen)
3. Never run `pnpm db:seed` / `pnpm db:seed:demo` against staging or production

Full behaviour, concurrency, and tenant-safety notes:
`docs/03-Database/reference-data.md`.
