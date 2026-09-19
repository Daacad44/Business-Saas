# System Architecture

```text
Next.js Web App
      |
   HTTPS/API
      |
Node.js + Express API
      |
  +---+---------+----------------+
  |             |                |
PostgreSQL    Redis           BullMQ
  |                              |
  |                           Worker
  |                              |
  +------------------------------+
                 |
     External Integrations
     WhatsApp / SMS / Email
     Payments / Storage
```

## Monorepo

```text
daljir-platform/
  apps/
    web/
    api/
    worker/
  packages/
    ui/
    types/
    validation/
    config/
    database/
    auth/
  prisma/
    schema.prisma
    migrations/
    seed/
  docs/
  tests/
  docker/
  CLAUDE.md
```

## Tenant Isolation
Every business-owned entity must contain `businessId` directly or be safely reachable through a business-owned parent. Service-layer queries must always scope by authenticated tenant context. Never trust a businessId supplied by the client.

## Transaction Boundary
A completed sale should atomically update:
- Sale
- Sale items
- Payment
- Payment allocation
- Stock movements
- Customer debt when applicable
- Audit event

Use database transactions for these mutations.
