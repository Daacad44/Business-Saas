# Reference Data (Permission Catalog)

Owner: Database / Prisma Engineer (`packages/database/`)

Schema migrations create the `Permission` table. They do **not** insert the
catalog the API uses to authorize tenant routes. `prisma migrate deploy`
therefore leaves `Permission` empty. Onboarding then creates system roles
with zero `RolePermission` rows, and every `requirePermission()` route
returns **403 FORBIDDEN**.

`pnpm db:seed` is **not** the production fix. In this tree that command is a
local convenience (catalog sync + demo seeder). The demo seeder currently
inserts no tenant sample rows; it exists so demo data cannot be mixed into
the deploy path.

## What is reference vs demo

Read from `packages/database/src/` (not guessed):

| Kind | Source | Rows | Production? |
|---|---|---|---|
| Permission catalog | `rbac.ts` `PERMISSION_CATALOG` (24 keys) | Global `Permission` | Yes — required to authorize |
| System role templates | `rbac.ts` `SYSTEM_ROLE_TEMPLATES` (9 roles) | Code + per-business `Role` / `RolePermission` at onboard | Yes — templates live in code; grants are tenant-scoped |
| Demo / sample tenants | `seed-demo.ts` | None in this tree | No — `pnpm db:seed:demo` only |

## Sync behaviour

`syncReferenceData` (`packages/database/src/sync-reference.ts`):

1. Opens a Prisma transaction with `timeout: 20000`.
2. Acquires `pg_advisory_xact_lock(hashtextextended('daljir:reference-data:permission-catalog', 0))` so concurrent API replicas and the deploy CLI cannot interleave upserts.
3. Upserts every catalog row by natural key (`Permission.key`). Adding a new catalog key is fine; `family` / `description` on known keys may be updated.
4. Adds **missing** `RolePermission` rows for `isSystem` roles whose slug matches a template (repairs empty-catalog onboards; grants new catalog keys to Owner/Admin). Custom (non-system) roles are not modified.
5. **Never** deletes a `Permission` or `RolePermission` row.
6. Unknown keys already in the database are logged at warn and left in place.
7. If the transaction throws, the caller fails. API startup treats that as fatal and does not listen.

## Where it is wired

| Hook | Command / site | Concurrent replicas |
|---|---|---|
| Deploy | `pnpm db:migrate:deploy` runs `prisma migrate deploy` then `tsx src/run-sync-reference.ts` | CLI is typically one-shot; lock still serializes if overlapped with API boot |
| Explicit | `pnpm db:sync-reference` | Same lock |
| API boot | `apps/api/src/index.ts` awaits `syncReferenceData(prisma)` **before** `listen` | Same lock |
| Local migrate | `prisma migrate dev` runs `prisma.seed` → `seed.ts` (catalog then demo) | Dev only |
| Demo | `pnpm db:seed:demo` | Must not run in production |

`createApp()` used by tests does not listen and does not sync. API tests call
`syncReferenceData` from `apps/api/src/__tests__/setup-reference-data.ts`.

## Failure behaviour

- CLI: non-zero exit, Prisma disconnects.
- API startup: logs `Fatal: reference data sync failed; refusing to listen`, `process.exit(1)`. No HTTP server. Not a warning.
- Onboarding with an empty catalog throws instead of creating an Owner with zero grants.

## Tenant safety

- `Permission` has no `businessId`. Catalog upserts are global and identical for every tenant.
- `Role` / `RolePermission` are tenant-scoped. Sync only **adds** missing template grants on `isSystem` roles. It never deletes grants, never rewrites custom roles, and never creates businesses, users, or sample sales.

## Coolify / production sequence

1. Backup the database (`docs/03-Database/migration-rollback.md` §2).
2. Set `DATABASE_URL` and `DATABASE_URL_DIRECT` to the target database.
3. `pnpm --filter @daljir/database generate`
4. `pnpm db:migrate:deploy` (schema + permission catalog). Do **not** run `pnpm db:seed` or `pnpm db:seed:demo`.
5. Start API replicas. Each replica re-runs the sync under the advisory lock; a failure prevents that replica from serving traffic.
6. Smoke: `GET /health` → 200, then register → onboard → a permission-gated route (for example `GET /api/v1/sales`) → 2xx.

If step 4 applied migrations but the chained sync failed, fix the error and
re-run `pnpm db:sync-reference` (or restart the API). Do not `prisma migrate reset`.
