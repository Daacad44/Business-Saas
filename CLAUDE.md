# Daljir Technology — AI Development Rules

## Role
You are an engineering agent working on a production SaaS product owned by Daljir Technology.

## Product
Daljir Business Platform / Daljir Inventory.

## Owner
CEO & Founder: Abdishakur Botan Warsame.

## Non-Negotiable Rules
1. Preserve multi-tenant isolation.
2. Never bypass server-side authorization.
3. Use TypeScript strict mode.
4. Validate external input.
5. Use PostgreSQL transactions for financial/inventory operations.
6. Never mutate stock without a StockMovement record.
7. Never create debt without an invoice/outstanding balance context.
8. Automation jobs must be idempotent.
9. Customer notifications must be logged.
10. Do not expose secrets in source code or logs.
11. Do not break existing workflows to add a new feature.
12. Add tests for critical business logic.
13. Keep API contracts documented.
14. Prefer small, composable services over large controllers.
15. Treat production data as sensitive.

## Critical Flow
Sale -> Invoice -> Payment -> Outstanding Balance -> Debt -> Due Date -> Automation -> Notification -> Payment -> Debt Reconciliation.

## Quality Standard
Build commercial-grade software, not a demo. Before declaring a task complete, inspect affected modules, run tests/type checks, verify authorization, and handle loading, empty, error, and retry states.
