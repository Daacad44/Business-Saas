# Transactional Invariants

This document captures the guarantees the Phase 2–7 implementation actually
makes at the database/transaction level, derived by reading the shipped
service code on `cursor/api-inventory-95e7`, `cursor/api-sales-95e7`,
`cursor/api-customers-95e7`, `cursor/api-purchases-95e7`,
`cursor/automation-worker-95e7`, and `cursor/api-reports-95e7`. It exists so
a future change cannot silently break an invariant that no test currently
exercises directly. Every claim below cites the source file it was read
from; nothing here is inferred from the schema alone.

## 1. Stock Ledger Invariant

Source: `apps/api/src/modules/inventory/stock.service.ts` (`applyStockMovement`).

- `StockMovement.quantity` is **SIGNED** relative to `StockLevel.quantity`:
  - Positive increases stock: `PURCHASE_IN`, `ADJUSTMENT_IN`, `TRANSFER_IN`,
    `RETURN_IN`, `OPENING_BALANCE`.
  - Negative decreases stock: `SALE_OUT`, `ADJUSTMENT_OUT`, `TRANSFER_OUT`,
    `RETURN_OUT`.
- **Invariant**: `SUM(StockMovement.quantity)` grouped by
  `(businessId, warehouseId, productId, variantId)` always equals the
  matching `StockLevel.quantity` row. `applyStockMovement` is the only
  function in the codebase that writes either table, and it always writes
  both in the same call, inside the caller's `prisma.$transaction`.
- **No bare movements.** Every `StockMovement` this codebase creates is
  linked back to its owning operation through a unique `movementId` foreign
  key on the child item row:
  - `SaleItem.movementId` (sale line → `SALE_OUT`)
  - `PurchaseItem.movementId` (goods receipt line → `PURCHASE_IN`)
  - `StockAdjustmentItem.movementId` (adjustment line → `ADJUSTMENT_IN`/`ADJUSTMENT_OUT`)
  - `StockTransferItem.outboundMovementId` / `.inboundMovementId` (dispatch leg / receive leg → `TRANSFER_OUT` / `TRANSFER_IN`)
  - `SalesReturnItem.movementId` (return line → `RETURN_IN`)
  - `PurchaseReturnItem.movementId` (return line → `RETURN_OUT`)

  There is intentionally no `POST /inventory/movements` route
  (`stock-movements.routes.ts` is read-only, with a comment explaining why)
  — the ledger can only grow through a domain operation that also creates
  the row it links to.
- `applyStockMovement` rejects (409) any movement that would drive
  `StockLevel.quantity` negative, computed with `Prisma.Decimal` arithmetic
  only. `assertSufficientStock` is a fail-fast preflight check used by sales,
  transfers, and purchase returns before building the movement, but the
  authoritative guard is the check inside `applyStockMovement` itself, taken
  under the same lock (see §2).

## 2. Concurrency: Advisory Locks

### 2.1 Stock line lock

Source: `apps/api/src/modules/inventory/stock.service.ts` (`lockStockLine`).

- Before reading or writing a `StockLevel` row, `applyStockMovement` takes a
  Postgres transaction-scoped advisory lock:
  `SELECT pg_advisory_xact_lock(hashtextextended(lockKey, 0))` where
  `lockKey = "stock:${businessId}:${warehouseId}:${productId}:${variantId ?? "none"}"`.
- This serializes every concurrent write against the exact same
  `(businessId, warehouseId, productId, variantId)` line, closing both:
  - two concurrent decrements racing to drive stock negative, and
  - two concurrent first-time inserts racing to create duplicate
    `StockLevel` rows for a line that doesn't exist yet.
- The lock is released automatically when the enclosing
  `prisma.$transaction` commits or rolls back — it never outlives the
  request.
- **Why advisory locks and not `SELECT ... FOR UPDATE`**: a plain row lock
  cannot protect the "row doesn't exist yet" case (there is no row to lock),
  and this codebase may not add a dedicated counter/lock table
  (out of scope for these branches — no `prisma/schema.prisma` changes).
  An advisory lock keyed by the logical identity of the stock line works
  whether or not the `StockLevel` row currently exists.

### 2.2 Sequence-number lock

Source: `apps/api/src/modules/sales/numbering.ts`,
`apps/api/src/modules/purchases/numbering.ts`.

- Per-business document numbers (`Sale.saleNumber`, `Invoice.invoiceNumber`,
  `SalesReturn.returnNumber`, `Purchase.purchaseNumber`,
  `PurchaseOrder.orderNumber`, `PurchaseReturn.returnNumber`) are derived
  from a **live `count()` under an advisory lock**, not a persistent counter
  table:
  - Sales module lock key: `seq:${businessId}:${kind}` where
    `kind ∈ {sale, invoice, return}`.
  - Purchases module lock key: `seq:${entity}:${businessId}` where
    `entity ∈ {PO, PUR, PRET}`.
- The lock is held for the life of the enclosing transaction, so a second
  transaction requesting a number for the same `(businessId, kind)` blocks
  until the first commits or rolls back.
- **Gap-free guarantee**: because the number is `count() + 1` rather than an
  incrementing sequence, a rolled-back transaction never "consumes" a
  number — the next transaction observes the same count and computes the
  same next number. This is the opposite of a Postgres `SERIAL`/`sequence`,
  which *does* burn values on rollback.
- **Defense in depth**: every numbered model also has a
  `@@unique([businessId, <numberColumn>])` constraint. If the advisory-lock
  discipline is ever bypassed by a future code path, the insert fails loudly
  (Postgres unique-violation) rather than silently duplicating a document
  number.
- **Fixed lock-acquisition order**: `numbering.ts` (sales) documents that
  callers needing more than one kind of number in the same transaction must
  always acquire them in the order **sale → invoice → return**. `createSale`
  follows this (`sales.service.ts`: sale number, then invoice number, in
  that order, before any payment/debt logic). This fixed order across the
  whole codebase is what prevents a lock-order-inversion deadlock between
  concurrent sales.

## 3. Cross-Tenant Access Convention (404, not 403)

Source: `apps/api/src/modules/purchases/validators.ts` (explicit comment),
confirmed by the identical pattern in every domain's service file
(`findFirst({ where: { id, businessId } })` followed by `notFound()`).

- Every foreign key that arrives in a request body or URL param
  (`warehouseId`, `productId`, `variantId`, `customerId`, `supplierId`,
  `purchaseOrderId`, `saleItemId`, `purchaseItemId`, `categoryId`, `unitId`,
  `branchId`, `expenseCategoryId`, `templateId`, `debtId`, path `:id`, …) is
  re-resolved against `req.tenant.businessId` before use, in every service
  file across all six domains.
- A row that **exists but belongs to a different business** is
  indistinguishable, in the HTTP response, from a row that does not exist
  at all: both cases raise `notFound()` → **404**, never `forbidden()` →
  **403**. This is deliberate and platform-wide, not domain-specific — an
  attacker who guesses another tenant's id cannot use the response to
  learn that the id exists.
- **403 is reserved** for the case where the caller is authenticated and
  tenant-scoped but lacks the required `PermissionKey`
  (`requirePermission()` in `middleware/tenant.ts`) — i.e. 403 means "you,
  as you are, may never do this action in this business," and 404 means
  "this specific resource id is not resolvable for you," whether because it
  truly doesn't exist or because it belongs to someone else.

## 4. Sequence Numbers — Summary

See §2.2 above for the mechanism. Formats observed in `serialize.ts`/service
files:

| Model | Prefix | Example |
|---|---|---|
| `Sale.saleNumber` | `S` | `S-000001` |
| `Invoice.invoiceNumber` | `INV` | `INV-000001` |
| `SalesReturn.returnNumber` | `RET` | `RET-000001` |
| `PurchaseOrder.orderNumber` | `PO` | `PO-000001` |
| `Purchase.purchaseNumber` | `PUR` | `PUR-000001` |
| `PurchaseReturn.returnNumber` | `PRET` | `PRET-000001` |

## 5. The Critical Flow — Exact Ordered Steps

Source: `apps/api/src/modules/sales/sales.service.ts` (`createSale`),
`apps/api/src/modules/sales/payments.service.ts` (`createSalePayment`),
`apps/api/src/modules/customers/credit.service.ts`
(`checkCreditEligibility`, `recalculateCustomerBalance`).

> Sale → Invoice → Payment → Outstanding Balance → Debt → Due Date →
> Automation → Notification → Payment → Debt Reconciliation

### 5.1 `POST /sales` — Cash sale (`type: "CASH"`)

All steps run inside one `prisma.$transaction`:

1. Resolve `branchId`, `warehouseId`, optional `customerId` against the
   tenant (404 if any doesn't resolve, or the warehouse doesn't belong to
   the branch).
2. For every line: resolve `productId`/`variantId` against the tenant,
   snapshot `unitPrice`/`costPrice` from the tenant's own catalogue
   (**never from the client** — see §7), compute line subtotal/discount/tax.
3. Compute sale-level `subtotal`/`discountAmount`/`taxAmount`/`totalAmount`
   with `Prisma.Decimal` only.
4. Acquire the `sale` sequence number, then the `invoice` sequence number
   (fixed order, §2.2).
5. Create the `Sale` row (`status: COMPLETED`).
6. For every line, in order: `assertSufficientStock` → `applyStockMovement`
   (`SALE_OUT`, negative quantity) → create the `SaleItem` row with
   `movementId` set to the just-created movement. A sale can never
   partially fail here — insufficient stock on any line rolls back the
   whole sale, including lines already decremented in this same
   transaction.
7. Create the `Invoice` row with `status: PAID`, `amountPaid = totalAmount`,
   `amountDue = 0`, `paidAt = now`.
8. Create a `Payment` row (`method: CASH`, `status: COMPLETED`,
   `amount = totalAmount`) and a `PaymentAllocation` row linking it to the
   invoice for the full amount.
9. Write an `AuditLog` row (`sale.create`) inside the same transaction.
10. Return the serialized sale + items + invoice + payment (`debt: null`,
    `customerBalance: null`).

### 5.2 `POST /sales` — Credit sale (`type: "CREDIT"`)

Steps 1–6 are identical (a `customerId` is mandatory here — enforced by
`createSaleSchema`'s `.refine()`, and `dueDate` is also mandatory). Then:

7. Create the `Invoice` row with `status: ISSUED`, `amountPaid = 0`,
   `amountDue = totalAmount`, `dueDate = input.dueDate`, `paidAt = null`.
8. **Credit eligibility check** (`checkCreditEligibility`, run inside the
   same transaction, so it sees the sale's own in-flight writes but not
   concurrent sales — those are serialized by the stock-line lock, not a
   customer-level lock): rejects with 409 and a `reason` if the customer
   record doesn't resolve, the customer is not `ACTIVE`, the customer has
   any `CustomerDebt` in `OVERDUE` status, or
   `amount > (creditLimit - currentBalance)`. Any rejection rolls back the
   whole sale — no partial credit sale, no orphan invoice.
9. Create the `CustomerDebt` row: `invoiceId` set to the invoice created in
   step 7 (unique — see §6), `principalAmount = totalAmount`,
   `amountPaid = 0`, `outstandingAmount = totalAmount`,
   `dueDate = input.dueDate`, `status: PENDING`.
10. `recalculateCustomerBalance` recomputes `Customer.currentBalance` as the
    sum of `outstandingAmount` across all of that customer's
    non-`CANCELLED` debts, and writes it back — never incremented
    in place, always recomputed from the authoritative debt rows.
11. Write the `AuditLog` row, return sale + items + invoice + `debt` +
    `customerBalance` (`payment: null`).

### 5.3 Where Automation/Notification fit

`Due Date → Automation → Notification` happens **outside** the sale
transaction, later, driven by the scheduler/worker
(`apps/worker`, structurally duplicated from
`apps/api/src/modules/automation/run-trigger-match.ts`'s
`processTriggerMatch`, per that file's own comment — the worker is a
separate deployable package and cannot import API source across the
workspace boundary). See §8 for the automation-side guarantees.

### 5.4 `POST /debts/:id/payments` and `POST /sales/:id/payment` — Reconciliation

Both `debts.service.ts:recordDebtPayment` and
`payments.service.ts:createSalePayment` run the same reconciliation shape
inside one transaction:

1. Reject (409) if the invoice/debt is already fully settled
   (`PAID`/`CANCELLED`/`VOID`), or if `amount` exceeds the current
   `amountDue`/`outstandingAmount` — **no overpayment is ever accepted**,
   checked before any write.
2. Update `Invoice.amountPaid` (+= amount), `Invoice.amountDue` (-= amount,
   floored to `Decimal(0)` when the subtraction would go negative due to
   rounding), `Invoice.status` (`PAID` when `amountDue <= 0`, else
   `PARTIALLY_PAID`), `Invoice.paidAt` (set once, on first full payment).
3. If a `CustomerDebt` is linked to the invoice, apply the identical
   pattern to `CustomerDebt.amountPaid`/`outstandingAmount`/`status`.
4. Create the `Payment` row and its `PaymentAllocation` (linked to both the
   invoice and, when applicable, the debt).
5. `recalculateCustomerBalance` — same recompute-from-source pattern as
   §5.2 step 10.
6. Write the `AuditLog` row.

**Reconciliation guarantee**: because step 1 rejects any payment that would
push `amountDue`/`outstandingAmount` below zero, and step 2/3 explicitly
floor to `Decimal(0)` rather than allow a small negative residue from
rounding, a fully paid debt's `Invoice.amountDue` and
`CustomerDebt.outstandingAmount` both reconcile to **exactly `"0.00"`**
(the 2-decimal-place serialized string — see §9), and
`Customer.currentBalance` (recomputed from source) reflects that same `0`
contribution. The three are never independently "close enough" — they are
derived from the same underlying `Decimal` arithmetic in the same
transaction.

## 6. Debt Requires Invoice Context

Source: Prisma schema (`CustomerDebt.invoiceId` unique) + every debt-creating
code path read.

- `CustomerDebt.invoiceId` is a **unique** foreign key.
- The only place a `CustomerDebt` row is created is inside `createSale`
  (§5.2 step 9), always with `invoiceId` set to the invoice just created in
  the same transaction. There is no endpoint or service function anywhere
  in the read branches that creates a `CustomerDebt` without an
  `invoiceId` already resolved. This matches `CLAUDE.md` rule 7
  ("Never create debt without an invoice/outstanding balance context.").

## 7. Price Integrity on Sales

Source: `apps/api/src/modules/sales/sales.service.ts` (top-of-file comment
and implementation).

- `createSaleSchema` validates `items[].unitPrice` and `items[].taxAmount`
  for *shape* (finite positive numbers), but `createSale` **never reads
  those client-supplied values for computation**. Every line's `unitPrice`
  is re-read from the tenant's own `Product.sellingPrice` /
  `ProductVariant.sellingPrice` inside the transaction; `costPrice` and
  `taxRate` are similarly re-read from the catalogue, never from the
  request body.
- `discountAmount` (per line, and the sale-level additional discount) *is*
  a legitimate client-supplied value (a cashier-applied discount), but it
  is clamped with `clampDecimal(value, ZERO, lineSubtotal)` so a discount
  can never make a line — or the sale — negative.
- There is no schema flag or code path today that allows a manual price
  override; see `docs/08-Roadmap/development-roadmap.md` for the scope
  note on what a future override feature would require.

## 8. Automation Idempotency and Execution Claiming

Source: `apps/api/src/modules/automation/idempotency.ts`,
`apps/api/src/modules/automation/run-trigger-match.ts`.

- **Deterministic idempotency key**: `buildAutomationIdempotencyKey(ruleId, debt, trigger)`
  returns `` `${ruleId}:${debt.id}:${offsetPart}:${dueDateISO}` `` where
  `offsetPart = trigger.offsetDays ?? trigger.type` (so triggers without an
  offset, e.g. `INVOICE_DUE_TODAY`/`INVOICE_OVERDUE`/`MANUAL`, still get a
  stable, trigger-type-scoped key) and `dueDateISO` is the debt's due date
  truncated to the calendar day (so re-running the scan multiple times in
  one day for the same debt/trigger can never produce more than one
  `AutomationExecution`).
- `processTriggerMatch` first attempts
  `prisma.automationExecution.create({ data: { ..., idempotencyKey, status: "RUNNING" } })`.
  This is the atomic **PENDING→RUNNING claim**: whichever caller's `create`
  lands first in Postgres wins; there is no separate read-then-write race
  window, because the uniqueness is enforced by the insert itself.
- A duplicate insert raises Postgres **`P2002`** (unique constraint
  violation on `idempotencyKey`). `isUniqueConstraintError` detects this
  specific code and `processTriggerMatch` treats it as a **safe no-op**
  (`created: false`, returns the existing execution's status) — **not** an
  error surfaced to the caller. This is the concrete mechanism behind
  `CLAUDE.md` rule 8 ("Automation jobs must be idempotent.").
- Only the caller that won the claim (created a genuinely new `RUNNING`
  row) proceeds to render templates and call `dispatchNotification` — so a
  double-scheduled job dispatches at most once per `(rule, debt, trigger,
  due-date)` tuple.
- `POST /automation/rules/:id/test` (`test-rule.service.ts`) evaluates real
  trigger matches against real debt data but never calls
  `dispatchNotification` and never writes an execution/notification row —
  it is a pure dry run, explicitly documented in its own response
  (`note: "Dry run only — no notifications were sent..."`).

## 9. Notification Logging Precedes Dispatch

Source: `apps/api/src/modules/notifications/dispatch.service.ts`
(`dispatchNotification`).

- `dispatchNotification` opens a `prisma.$transaction` that creates, in
  this order, **before any provider/driver call is made**:
  1. The `Notification` row (`status: PENDING`).
  2. The channel-specific message row (`WhatsAppMessage`/`SMSMessage`/
     `EmailMessage`, `status: QUEUED`) — skipped only for `IN_APP`, which
     has no channel-message table.
  3. A `NotificationLog` row (`status: QUEUED`).
- Only after that transaction commits does it call `driver.send(...)`.
- Every subsequent send attempt (`while (attempt < maxAttempts)`, retried
  with exponential backoff — `retryBaseMs * 2^(attempt-1)`) writes another
  `NotificationLog` row and updates the channel-message row's status inside
  its own transaction, whether the attempt succeeded or threw.
- There is no code path in `dispatchNotification` that reaches
  `driver.send()` without the logging rows already committed — this is the
  concrete mechanism behind `CLAUDE.md` rule 9 ("Customer notifications must
  be logged.").
- `WEBHOOK` automation actions are intentionally excluded from this
  pipeline (`run-trigger-match.ts`: `actionChannel()` returns `null` for
  `WEBHOOK`, and the loop `continue`s) — see the Roadmap doc for the scope
  note that webhook actions are stored but not executed.

## 10. Cost Valuation — Weighted Average

Source: `apps/api/src/modules/purchases/purchases.service.ts`
(`createPurchase`).

- On every goods receipt (`POST /purchases`), for each line:
  1. Read `priorQty` = `SUM(StockLevel.quantity)` for that
     `(businessId, productId, variantId)` across **all warehouses**
     (`tx.stockLevel.aggregate(...)`, no `warehouseId` filter) — i.e. this
     is a **business-wide** weighted average, not a per-warehouse one.
  2. Read `priorCost` = the product's (or variant's) current
     `costPrice`.
  3. If `priorQty` is zero, the new cost is simply the incoming
     `unitCost` (nothing to average against). Otherwise:

     ```text
     newCost = (priorQty * priorCost + receivedQty * unitCost)
               / (priorQty + receivedQty)
     ```

     computed entirely in `Prisma.Decimal`.
  4. Write `newCost` back to `Product.costPrice` or
     `ProductVariant.costPrice` (whichever the line targets) inside the
     same transaction as the stock movement and the `PurchaseItem` row.
- Because `priorQty` is read from `StockLevel` (the authoritative ledger
  total from §1) rather than accumulated separately, the weighted average
  can never drift from actual on-hand quantity, even across multiple
  warehouses receiving stock for the same product.
- This same transaction also updates the linked `PurchaseOrder`'s status
  to `PARTIALLY_RECEIVED` or `RECEIVED` by comparing cumulative received
  quantity (across **all** purchases against that order, via
  `purchaseItem.groupBy`) against the order's original line quantities —
  never based on this one receipt in isolation.

## 11. Supplier / Customer Balance Recompute-from-Source

Source: `apps/api/src/modules/purchases/balance.service.ts`
(`recalculateSupplierBalance`), `apps/api/src/modules/customers/credit.service.ts`
(`recalculateCustomerBalance`).

- Both functions follow the identical pattern: **never increment a balance
  field in place**. Instead, on every mutation that could affect the
  balance (payment, return, new debt/purchase), sum the authoritative child
  rows (`CustomerDebt.outstandingAmount` for customers,
  `Purchase.amountDue` for suppliers, both excluding `CANCELLED` rows) and
  overwrite the parent's cached balance column with that sum, inside the
  same transaction as the mutation that triggered the recompute.
- This means `Customer.currentBalance` and `Supplier.currentBalance` are
  denormalized caches that are always trustworthy at the moment they're
  read, because they can never be updated by anything other than a full
  recompute from the source-of-truth rows in the same transaction as the
  write that changed those rows.
