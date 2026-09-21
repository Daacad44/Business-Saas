# Daljir Business Platform

Multi-tenant SaaS for inventory, POS, customers, credit/debt, and automated reminders.

**Company:** Daljir Technology  
**Tagline:** Creating what moves you forward  
**CEO:** Abdishakur Botan Warsame

## Phase 1

Authentication, multi-tenancy, RBAC, business onboarding, branches, and warehouses. English and Somali UI.

## Stack

- Web: Next.js, TypeScript, Tailwind, shadcn/ui, next-intl
- API: Express, TypeScript
- Data: PostgreSQL, Prisma
- Jobs: Redis + BullMQ (worker stub in Phase 1)

## Local development

```bash
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed:demo
pnpm dev
```

`pnpm db:migrate` (`prisma migrate dev`) applies schema migrations and then the Prisma seed, which syncs the permission catalog and runs the demo seeder. Production must not use `pnpm db:seed` / `pnpm db:seed:demo`. Deploy with `pnpm db:migrate:deploy` (migrations + reference catalog only). See `docs/03-Database/reference-data.md`.

If the API starts against a database that has schema but no catalog, it runs the same sync on boot (fatal on failure) so tenant routes cannot 403 because Owner was provisioned with zero permissions.

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1

If Docker is unavailable, set `DATABASE_URL` and `DATABASE_URL_DIRECT` to a PostgreSQL instance (for example Neon) and skip Compose. Unclaimed Neon databases expire after 72 hours unless you open the claim URL written to `.env`.

## Workspace

```
apps/web          Next.js UI
apps/api          Express API
apps/worker       BullMQ worker stub
packages/database Prisma client, permission catalog sync, and demo seed
packages/validation Shared Zod schemas
packages/types    Shared TypeScript types
packages/config   Shared TypeScript config
prisma/           Schema and migrations
```
