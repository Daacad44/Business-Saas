# RBAC Blueprint

## Default Roles
- Owner
- Admin
- Manager
- Accountant
- Cashier
- Sales Staff
- Inventory Manager
- Warehouse Staff
- Viewer

## Permission Families (current reality)

This is the exact `PermissionKey` union shipped in
`packages/types/src/index.ts` and enforced server-side by
`requirePermission()` in `apps/api/src/middleware/tenant.ts`, cross-checked
against every route file across `cursor/api-inventory-95e7`,
`cursor/api-customers-95e7`, `cursor/api-sales-95e7`,
`cursor/api-purchases-95e7`, `cursor/automation-worker-95e7`, and
`cursor/api-reports-95e7`. It has **not grown** since Phase 1 — every new
domain shipped in Phases 2–7 was mapped onto this existing list rather than
extending it, which is the source of the reuse gaps documented below.

```text
sales.create
sales.read
sales.update
sales.delete
inventory.create
inventory.read
inventory.adjust
inventory.transfer
customers.create
customers.read
customers.update
debts.read
debts.collect
debts.remind
purchases.create
purchases.read
reports.read
expenses.create
expenses.read
users.invite
users.manage
settings.manage
automation.manage
```

`sales.delete` exists in the type union but no route in
`cursor/api-sales-95e7` requires it — there is no sale void/cancel endpoint
(see `docs/08-Roadmap/development-roadmap.md`). It is effectively unused
today.

## Current Reality: Reused Keys Across New Domains

Three agents working on Phases 3, 4, and 6/5 independently needed a
permission for an action that has no dedicated key, and each reused the
closest existing key rather than adding a new one (adding a key would mean
editing `packages/types`, which is shared/foundation-owned and out of scope
for a single domain branch). This section documents **what the shipped
code actually checks today** — not what it should check.

| Action | Route | Permission checked | Why |
|---|---|---|---|
| Collect payment on a sale's invoice | `POST /sales/:id/payment` | `debts.collect` | No `payments.*` family exists. Reusing `debts.collect` conflates "settling a sale's invoice directly" with "collecting against a customer debt," even though a cash sale's payment never touches `CustomerDebt` at all. |
| Soft-disable (archive) a customer | `DELETE /customers/:id` | `customers.update` | No `customers.delete` exists. A role granted `customers.update` can therefore also disable customers, which may be broader than intended (e.g. a data-entry role that should edit but not disable). |
| Create/update a supplier, disable a supplier, record a supplier payment | `POST /suppliers`, `PATCH /suppliers/:id`, `DELETE /suppliers/:id`, `POST /suppliers/:id/payments` | `purchases.create` | No `suppliers.*` family exists. |
| Create/approve/cancel a purchase order | `POST /purchase-orders`, `POST /purchase-orders/:id/approve`, `POST /purchase-orders/:id/cancel` | `purchases.create` | No `purchase_orders.*` family exists. Notably, **approving** a purchase order (a commitment/authorization action) requires the same key as merely drafting one. |
| Record a purchase return | `POST /purchases/:id/returns` | `purchases.create` | No `purchases.update` exists to distinguish "receive new goods" from "process a return against an existing receipt." |
| All purchases-domain reads (suppliers, purchase orders, purchases, returns, payables) | every `GET` under `/suppliers`, `/purchase-orders`, `/purchases`, `/payables` | `purchases.read` | Consistent with the single-key-per-domain pattern above; there is no way to grant read access to, say, supplier payment history without also granting read access to purchase orders. |
| Create/update/delete an expense category, create/update/delete an expense | `POST/PATCH/DELETE /expense-categories/:id`, `POST/PATCH/DELETE /expenses/:id` | `expenses.create` | No `expenses.update`/`expenses.delete` exists. Note that `DELETE /expenses/:id` is a **hard delete** (unlike most other domains' soft-disable pattern), gated by the same key as creating one. |
| All automation rule and execution actions (list/create/update/delete/activate/deactivate/test rules; list/get executions) | every route under `/automation/*` | `automation.manage` | No sub-keys for read-only vs. mutating actions, or for rules vs. executions. |
| All notification actions (templates, history, logs, test send) | every route under `/notifications/*` | `automation.manage` | Notifications share automation's single key entirely — there is no `notifications.*` family at all, not even a reused-but-distinct one. A role that can manage automation rules can also read every customer's notification history and send arbitrary test notifications. |

## Rules
1. Permissions are checked on the server.
2. UI hiding is not security.
3. Role assignment is tenant-scoped.
4. Owner has full business control.
5. Super Admin permissions are platform-scoped and separate from business
   roles (`requirePlatformAdmin`, not a `PermissionKey`).

---

## PROPOSED — Granular Keys for a Future Decision

**Nothing below this line exists in code.** These are candidate additions
for a future RBAC revision, informed by the reuse gaps above. They are
listed here only so the tradeoff is visible; implementing any of them
requires editing `packages/types` (shared foundation) and the seed data for
default roles, and is out of scope for the domain branches that surfaced
the need.

- `payments.create` / `payments.read` — would let `POST /sales/:id/payment`
  stop overloading `debts.collect` for a payment that may not involve a
  debt at all.
- `customers.delete` — would let a role edit customer records without also
  being able to disable them.
- `suppliers.create` / `suppliers.update` / `suppliers.delete` /
  `suppliers.read` — would separate supplier master-data management from
  purchase-order/receiving permissions.
- `purchase_orders.create` / `purchase_orders.approve` /
  `purchase_orders.cancel` / `purchase_orders.read` — approval is a
  materially different risk than drafting; today they are identical.
- `purchases.update` — to distinguish "record a new goods receipt" from
  "process a return against an existing one," without adding a full
  `purchases.delete`.
- `expenses.update` / `expenses.delete` — to separate expense entry from
  expense correction/removal, especially since deletion is a hard delete
  today.
- `automation.read` (rules + executions, view-only) separate from
  `automation.write` (create/update/delete/activate/deactivate/test) —
  would let an Accountant-type role see automation activity without being
  able to change what fires.
- `notifications.read` (history/logs, view-only) separate from
  `notifications.manage` (templates, test-send) and from
  `automation.manage` entirely — today, granting any automation
  capability also grants full notification-history visibility across all
  customers, which is a broader disclosure than most roles likely need.
