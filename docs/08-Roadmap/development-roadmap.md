# Development Roadmap

## Phase 0 — Foundation
1–2 weeks
- PRD
- Architecture
- ERD
- API conventions
- UX system
- Security model
- CI/CD

## Phase 1 — SaaS Foundation
2–3 weeks
- Auth
- Multi-tenancy
- Business
- Memberships
- Roles
- Permissions
- Invitations
- Branches
- Warehouses

## Phase 2 — Inventory — **DELIVERED** (`cursor/api-inventory-95e7`)
- Products — delivered (soft-delete via `status: ARCHIVED`, not a hard
  delete; no bulk import endpoint despite the original blueprint listing
  `POST /products/import` — not implemented)
- Categories — delivered (hard delete, blocked while children/products
  reference it)
- Variants — delivered, nested under `/products/:productId/variants`
- SKU / Barcode — delivered, unique per business for both products and
  variants
- Units — delivered
- Stock (levels) — delivered, including low-stock and valuation views
- Movements — delivered as a **read-only ledger**; every movement is
  created transactionally by its owning operation (see
  `docs/04-API/transactional-invariants.md` §1) — there is no direct
  write endpoint, by design
- Adjustments — delivered (`inventory.adjust` permission)
- Transfers — delivered (`inventory.transfer` permission), two-leg
  dispatch/receive model
- Batches — delivered as **metadata only**; batch quantity is not linked
  to the stock ledger (`StockLevel`) — verify before relying on it as a
  source of truth for on-hand quantity

## Phase 3 — Sales/POS — **DELIVERED** (`cursor/api-sales-95e7`)
- POS / Sales — delivered (cash and credit)
- Invoices — delivered, generated 1:1 with every sale
- Receipts — delivered (`GET /invoices/:id/receipt`, a print-oriented
  composite view)
- Payments — delivered (`POST /sales/:id/payment`)
- Returns — delivered (`POST /sales/:id/return`), restocks via
  `RETURN_IN` and reduces invoice/debt amounts
- Discounts — delivered (per-line and sale-level, clamped to never go
  negative)
- Credit sales — delivered, gated by `checkCreditEligibility`

### Scope gaps surfaced during Phase 3 implementation
- **Sale void/cancel is not implemented.** There is no endpoint to cancel
  a completed sale; `Sale.status` transitions were not observed to leave
  `COMPLETED`. A void feature would need to reverse the stock movement,
  invoice, and any debt/payment atomically — treat this as a new
  transactional design, not a small addition.
- **No `Refund` model exists.** A return against an already-paid cash
  invoice reduces `Invoice.amountPaid`/`amountDue` and (if applicable)
  `CustomerDebt` amounts, but creates no explicit refund record — there is
  no ledger entry representing "money physically handed back to the
  customer." Reconciling actual cash-drawer refunds against these return
  records today requires external bookkeeping.
- **`createSaleSchema` accepts `unitPrice`/`taxAmount` per line but the
  server always ignores them** and recomputes both from the tenant's own
  product/variant catalogue (see
  `docs/04-API/transactional-invariants.md` §7). This is a deliberate
  price-integrity decision, not an oversight — but it means a legitimate
  future need (e.g. a manager manually overriding a price at the register)
  has no code path today. Implementing one would require an explicit new
  schema flag (e.g. `items[].priceOverride: true`) plus a dedicated
  permission gate (e.g. `sales.override_price`) checked before accepting
  the client-supplied value, not silently trusting it once the flag is
  present.

## Phase 4 — Customer/Debt — **DELIVERED** (`cursor/api-customers-95e7`)
- Customers — delivered
- Credit limits — delivered (`checkCreditEligibility`)
- Debt — delivered; `CustomerDebt.invoiceId` is unique and there is no
  endpoint that creates a bare debt (see
  `docs/04-API/transactional-invariants.md` §6)
- Partial payments — delivered
- Due dates — delivered
- Aging — delivered (`GET /debts/aging`, buckets: current, 1-30, 31-60,
  61-90, 90+)
- Collection — delivered (`POST /debts/:id/payments`,
  `POST /debts/:id/remind`)

### Scope gaps surfaced during Phase 4 implementation
- **`DELETE /customers/:id` (soft-disable) reuses `customers.update`** —
  see `docs/05-RBAC/rbac-matrix.md`. It also only succeeds when the
  customer has zero outstanding balance **and** zero invoice history,
  which in practice restricts it to customers that never transacted.
- **`GET /debts/due-today` uses a server-local UTC day boundary**, not a
  per-business timezone (`Business.timezone` exists on the model but was
  not observed to be read by this endpoint) — a business outside UTC may
  see debts appear/disappear from this list at the wrong local hour.

## Phase 5 — Automation — **DELIVERED** (`cursor/automation-worker-95e7`)
- Scheduler — delivered as the shared `processTriggerMatch` logic,
  structurally duplicated between `apps/api` and `apps/worker` because the
  worker cannot import API source across the workspace package boundary
- Redis / BullMQ — delivered (worker package)
- Notification service — delivered (`dispatchNotification`, full
  logging-before-dispatch guarantee — see
  `docs/04-API/transactional-invariants.md` §9)
- Templates — delivered (versioned via auto-incrementing `version` on
  body edits)
- WhatsApp — delivered as a driver interface + a real driver
  implementation
- SMS/Email architecture — delivered, same driver interface
- Retry/delivery logs — delivered (exponential backoff, `NotificationLog`
  per attempt)

### Scope gaps surfaced during Phase 5 implementation
- **`WEBHOOK` automation actions are stored but not executed.** The
  `AutomationAction.type` enum includes `WEBHOOK` and the create/update
  schemas accept it, but `run-trigger-match.ts`'s `actionChannel()`
  returns `null` for it and the dispatch loop skips it entirely with a
  comment noting webhook actions are "intentionally out of scope for the
  notification pipeline." A rule that only has webhook actions will
  report `status: SUCCESS` (no failure) but send nothing.
- **Automation and Notifications share one permission key**
  (`automation.manage`) with no read/write or rules/notifications split —
  see `docs/05-RBAC/rbac-matrix.md`.
- **The manual debt-reminder path (`POST /debts/:id/remind`) does not use
  `dispatchNotification`.** It writes its own `Notification` +
  `NotificationLog` pair directly with a hardcoded `"internal"` provider
  and `status: SENT`, bypassing the driver/retry/logging pipeline that
  automation-triggered reminders use. Both paths satisfy CLAUDE.md rule 9
  (logging happens either way) but they are genuinely two different code
  paths, not one shared implementation — a future change to the dispatch
  pipeline (e.g. adding a new required log field) will not automatically
  apply to manual reminders.

## Phase 6 — Purchases — **DELIVERED** (`cursor/api-purchases-95e7`)
- Suppliers — delivered
- Purchase orders — delivered (`DRAFT → SENT → PARTIALLY_RECEIVED/RECEIVED`,
  or `CANCELLED` from any pre-received state)
- Receiving — delivered as `Purchase` (goods receipt)
- Supplier payments — delivered, with FIFO-on-account and per-purchase
  modes
- Returns — delivered (`PurchaseReturn`)
- Expense categories & expenses — delivered (adjacent to Purchases in the
  same branch, not originally scoped as a named line item in this
  roadmap's Phase 6 list, but shipped as part of the same body of work)
- Payables — delivered (outstanding, aging, payment history)

### Scope gaps surfaced during Phase 6 implementation
- **There is no separate `GoodsReceipt` model.** `Purchase` is both the
  commercial document and the stock-incrementing transaction, optionally
  linked to a `PurchaseOrder` via `purchaseOrderId`. A future
  multi-receipt-per-order or partial-receipt-line-tracking feature would
  need to reshape this relationship, not just add a field.
- **Purchases have no tax field in the validation schema.**
  `createPurchaseSchema` computes `taxAmount = Decimal(0)` unconditionally
  — every purchase's tax amount is `0` regardless of what the supplier
  actually charged. This is a real gap for any business that needs to
  track input VAT/tax on purchases.
- **Purchase payables age from `Purchase.receivedAt`**, not from a due
  date, because `Purchase` has no due-date field — the opposite
  convention from customer-debt aging (which ages from
  `CustomerDebt.dueDate`). If suppliers extend real payment terms (e.g.
  "net 30"), this report currently cannot reflect that.
- **`CashAccount` / `FinancialTransaction` (general ledger / cash
  accounts) were intentionally NOT modelled** in this phase, even though
  both appear under "Finance" in `docs/03-Database/data-model.md`. No
  route, service, or schema for either was found on any of the six
  branches. Cash-in/cash-out from sales and purchase payments exists only
  implicitly, through `Payment`/`SupplierPayment`/`Expense` rows — there
  is no consolidated cash-account balance or ledger transaction model.
  Treat this as an explicit scope boundary for Phase 6, not an oversight
  to silently patch later.
- **RBAC gaps** — see `docs/05-RBAC/rbac-matrix.md` for the full list of
  reused keys (`suppliers.*`, `purchase_orders.*`, `purchases.update`,
  `expenses.update`/`.delete` all reuse `purchases.create`/`expenses.create`).

## Phase 7 — Reports — **DELIVERED** (`cursor/api-reports-95e7`, 19 endpoints)
- Sales — delivered (overview, by-branch, by-customer, by-product,
  by-payment-method, top-products)
- Inventory — delivered (valuation, movement summary, low-stock,
  expiring-batches, slow-moving)
- Customers / Debts — delivered as "Receivables" (aging, collections)
- Debts — delivered (see Receivables above; also surfaced via the
  Customers/Debts module directly at `/debts/aging`)
- Revenue — delivered via `/reports/dashboard` and `/reports/sales`
- Expenses — delivered (`/reports/expenses`, `/reports/purchases`,
  `/reports/payables`)
- Profit — delivered (`/reports/profit`, `/reports/profit/by-product`)
- Exports — **not delivered**. No CSV/XLSX/PDF export endpoint exists for
  any report; every endpoint returns JSON only.

### Scope gaps and technical debt surfaced during Phase 7 implementation
- **Six missing database indexes were identified by the reports work but
  not added** (adding them requires a `prisma/schema.prisma` migration,
  which was out of scope for a reports-only branch):
  - `Sale(businessId, status, soldAt)`
  - `SaleItem(businessId, saleId)`
  - `Purchase(businessId, status, receivedAt)`
  - `StockLevel(businessId, quantity)`
  - `Payment(businessId, status, paidAt)` and/or
    `DebtPayment(businessId, paidAt)`
  - `CustomerDebt(businessId, outstandingAmount)`

  Every report's `where` clause filters on some combination of these
  columns; without the composite indexes, several report endpoints
  (especially `/reports/sales`, `/reports/profit`, and
  `/reports/receivables/aging`) will do sequential scans as data volume
  grows. This should be the first migration considered before Phase 7
  is exposed to production-scale tenants.
- **Reports use a different pagination convention** (`page`/`limit`,
  default `limit=50`, max `limit=200`) than every other module
  (`page`/`pageSize`, default `pageSize=20`, max `pageSize=100`) — see
  `docs/04-API/api-blueprint.md` Conventions section. Not a bug, but a
  real inconsistency a future unification pass should resolve
  deliberately rather than by accident.
- **Reports validation errors return 422**, uniquely among all modules
  (every other module's Zod failures surface as 400). Deliberate per
  `reports/lib/validate.ts`'s own comment, but worth flagging so a future
  API-wide error-code unification doesn't silently change reports client
  behavior.
- **`/reports/inventory/slow-moving` caps at 5000 stock-level rows** and
  **`/reports/receivables/aging` caps at 20000 open debts**
  (`MAX_OPEN_DEBTS`) before filtering/bucketing in application code, with
  no error or warning when the cap is hit — a large tenant can silently
  receive an incomplete report from either endpoint.
- **`GET /reports/inventory/valuation` and
  `GET /inventory/stock-levels/valuation` are two separate
  implementations** (Reports module vs. Inventory module) computing a
  conceptually similar total stock valuation. They were not observed to
  share code, and this audit did not verify they always agree — flagged
  as unverified; do not assume interchangeability without a direct
  cross-check.

## Phase 8 — Super Admin & SaaS
2 weeks
- Plans
- Subscriptions
- Usage
- Platform analytics
- Business management

> Not in scope for this audit. A quick read of
> `apps/api/src/modules/admin/admin.routes.ts` (present identically across
> all six branches, i.e. shared foundation code) shows the actually
> mounted paths differ from this roadmap's original Phase 1 blueprint
> listing — see the note in `docs/04-API/api-blueprint.md`'s Phase 8
> section. Flagged for a future dedicated audit.

## Phase 9 — Hardening
2 weeks
- Security
- E2E tests
- Performance
- Backups
- Monitoring
- Documentation
- Production launch

> The six missing indexes (Phase 7) and the pagination/error-code
> inconsistencies (Phase 7) should be prioritized early in this phase,
> before broader performance/E2E work, since they affect every tenant's
> reporting experience directly.

Estimated production-ready MVP: 17–23 weeks for focused full-time development.
