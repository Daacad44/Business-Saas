# API Blueprint

Base: `/api/v1`

## Conventions

These conventions apply across every domain below and are established by
the shipped implementation, not by design intent alone. See
`docs/04-API/transactional-invariants.md` for the full transactional
reasoning behind several of these.

- **Response envelope**: every response is `{ data, error, meta }`. Success
  responses set `error: null`; error responses set `data: null` and
  `error: { code, message, details }`.
- **Money and quantity are STRINGS.** Every money field (prices, totals,
  balances, payments) is serialized to a string with exactly **2 decimal
  places** (`Decimal.toFixed(2)`); every quantity field is serialized to a
  string with exactly **3 decimal places** (`Decimal.toFixed(3)`). This is
  deliberate, to preserve `Prisma.Decimal` precision across the JSON
  boundary — do not parse these fields as JavaScript `number` for further
  money/quantity arithmetic client-side without re-parsing as a decimal
  type.
- **Cross-tenant access → 404, never 403.** Any id (`:id` path param or a
  body field like `customerId`, `productId`, `warehouseId`, …) that
  resolves to a row belonging to a *different* business is treated
  identically to an id that doesn't exist: the response is **404
  NOT_FOUND**. **403 FORBIDDEN** is reserved for "you lack the permission
  key required for this action," never for "this id belongs to someone
  else." This prevents resource-existence enumeration across tenants and
  is applied uniformly by every domain read in this audit.
- **Pagination — two conventions coexist:**
  - Inventory, Sales, Customers/Debts, Purchases/Expenses, Automation, and
    Notifications use `page` / `pageSize` (default `pageSize=20`, max
    `pageSize=100`). Response `meta` is
    `{ page, pageSize, total, totalPages }`.
  - **Reports** uses `page` / `limit` instead (default `limit=50`, max
    `limit=200`, max `page=10000`). Response `meta` is
    `{ page, limit, total, totalPages }`. See the Reports section below —
    this inconsistency is real in the shipped code, not a typo in this
    document.
- **Report date ranges**: `startDate`/`endDate` query params are **both
  inclusive**. Omitting either or both defaults to a rolling 30-day window
  ending "now" (some reports use a different default window — noted per
  endpoint). Abuse limits, enforced by Zod and rejected with **422
  UNPROCESSABLE_ENTITY** (not the API-wide default of 400 for validation
  errors — the Reports module deliberately opts out of the shared
  ZodError→400 handler; see `reports/lib/validate.ts`):
  - Maximum date range: **366 days**. `startDate` after `endDate`, or a
    range exceeding 366 days, is rejected with 422.
  - Maximum `limit`: **200** (default **50**).
  - Maximum `page`: **10000**.
  - Maximum top-N (`/reports/sales/top-products`'s `limit`): **100**
    (default 10).
- **Error codes used throughout**: `401 UNAUTHORIZED` (no/invalid session),
  `403 FORBIDDEN` (missing permission), `404 NOT_FOUND` (id not resolvable
  for this tenant), `409 CONFLICT` (business-rule violation — duplicate
  unique field, insufficient stock, overpayment, invalid state transition),
  `422 UNPROCESSABLE_ENTITY` (Reports module query validation only — every
  other module's Zod validation failures surface as `400 VALIDATION_ERROR`
  via the shared error handler).

## Auth
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
GET  /auth/me

## Businesses
GET /businesses/current
PATCH /businesses/current
GET /businesses/current/settings
PATCH /businesses/current/settings

## Users & RBAC
GET /users
POST /users/invite
PATCH /users/:id
DELETE /users/:id
GET /roles
POST /roles
PATCH /roles/:id
GET /permissions

---

## Phase 2 — Inventory

Source verified: `apps/api/src/modules/inventory/*` on
`cursor/api-inventory-95e7`. Mounted in `app.ts` as:
`/units`, `/categories`, `/products` (+ nested variants),
`/batches`, `/inventory/stock-levels`, `/inventory/movements`,
`/inventory/adjustments`, `/inventory/transfers`.

> **Discrepancy vs. the previous version of this document**: the old
> blueprint listed `GET /inventory`, `GET /inventory/movements`,
> `POST /inventory/adjustments`, `POST /inventory/transfers`,
> `POST /inventory/transfers/:id/receive` under a flat `/inventory` prefix,
> and `POST /products/import` under Products. Neither `GET /inventory` nor
> `POST /products/import` exist in the shipped route files. The real mount
> points are `/inventory/stock-levels`, `/inventory/movements`,
> `/inventory/adjustments`, `/inventory/transfers` (matching the old doc for
> the last three) and there is no bulk product import endpoint.

### Units

| Method | Path | Permission |
|---|---|---|
| GET | `/units` | `inventory.read` |
| GET | `/units/:id` | `inventory.read` |
| POST | `/units` | `inventory.create` |
| PATCH | `/units/:id` | `inventory.create` |
| DELETE | `/units/:id` | `inventory.create` |

- `POST`/`PATCH` body: `createUnitSchema` / `updateUnitSchema` —
  `{ name: string (1-60), symbol: string (1-16) }`, both optional on
  update.
- `symbol` is unique per business (`businessId_symbol`); a duplicate is
  **409**.
- `DELETE` is a hard delete but is rejected **409** if any `Product`
  references the unit (`Product.unitId`). Response on success:
  `{ ok: true }`.
- Response shape: the raw `Unit` row (`id`, `businessId`, `name`, `symbol`,
  timestamps) — no money/quantity fields, so no string-serialization
  applies.
- Errors: 401, 403, 404 (`Unit not found`), 409 (duplicate symbol / unit in
  use).

### Categories

| Method | Path | Permission |
|---|---|---|
| GET | `/categories` | `inventory.read` |
| GET | `/categories/:id` | `inventory.read` |
| POST | `/categories` | `inventory.create` |
| PATCH | `/categories/:id` | `inventory.create` |
| DELETE | `/categories/:id` | `inventory.create` |

- `POST` body: `createCategorySchema` —
  `{ name: string (1-120), parentId?: string, description?: string (max 240) }`.
- `PATCH` body: `updateCategorySchema` — all fields optional,
  `parentId`/`description` nullable, plus `status?: "ACTIVE" | "ARCHIVED"`.
- `DELETE` is a hard delete, rejected **409** if the category has any child
  category or any `Product` referencing it. Response: `{ ok: true }`.
- Errors: 401, 403, 404 (`Category not found`), 409 (has children/products).

### Products

| Method | Path | Permission |
|---|---|---|
| GET | `/products` | `inventory.read` |
| GET | `/products/:id` | `inventory.read` |
| POST | `/products` | `inventory.create` |
| PATCH | `/products/:id` | `inventory.create` |
| DELETE | `/products/:id` | `inventory.create` |

- `GET /products` query params: `page`, `pageSize`, `search` (matches
  `name`/`sku`/`barcode`, case-insensitive), `categoryId`, `status`,
  `sortBy` (one of `name`, `sku`, `createdAt`, `sellingPrice`, `costPrice`;
  falls back to `createdAt`), `sortDir` (`asc`/`desc`, default `desc`).
- `POST` body: `createProductSchema` —
  `{ categoryId?, unitId?, name (1-160), sku (1-64), barcode?, description?, costPrice: money ≥ 0 (default 0), sellingPrice: money > 0, taxRate: 0-100 (default 0), trackStock: boolean (default true), hasVariants: boolean (default false), lowStockThreshold?: quantity ≥ 0 }`.
  `categoryId`/`unitId`, if provided, must resolve within the tenant (404
  otherwise). `sku` and `barcode` are each unique per business — duplicate
  is **409**.
- `PATCH` body: `updateProductSchema` — same fields, all optional,
  `categoryId`/`unitId`/`barcode`/`description`/`lowStockThreshold`
  nullable, plus `status?: "ACTIVE" | "ARCHIVED"`.
- `DELETE` is a **soft delete**: sets `status = ARCHIVED` and returns the
  archived product (200), not a hard delete — there is no
  `products.count` guard here because archiving, unlike deleting a unit or
  category, does not orphan anything.
- Response shape (`serializeProduct` in `mappers.ts`): raw `Product` row
  with `costPrice`, `sellingPrice`, `taxRate`, `lowStockThreshold`
  serialized as money strings (`lowStockThreshold` is a quantity
  conceptually but is serialized through the same `decimalToString`
  helper, i.e. no fixed decimal-place truncation is applied to it
  specifically — verify before relying on a fixed precision for this one
  field; **flagged as unverified precision** since `decimalToString` calls
  bare `.toString()`, not `.toFixed(2)`/`.toFixed(3)`).
- Errors: 401, 403, 404 (product/category/unit not found), 409 (duplicate
  sku/barcode).

### Product Variants (nested under Products)

| Method | Path | Permission |
|---|---|---|
| GET | `/products/:productId/variants` | `inventory.read` |
| GET | `/products/:productId/variants/:id` | `inventory.read` |
| POST | `/products/:productId/variants` | `inventory.create` |
| PATCH | `/products/:productId/variants/:id` | `inventory.create` |
| DELETE | `/products/:productId/variants/:id` | `inventory.create` |

- `POST` body: `createProductVariantSchema` —
  `{ name (1-160), sku (1-64), barcode?, costPrice: money ≥ 0 (default 0), sellingPrice: money > 0, attributes?: object (default {}) }`.
  (`productId` is taken from the URL, not the body — a body `productId`
  that doesn't match the URL is rejected **400**.) `sku`/`barcode` unique
  per business, scoped across all variants (not per-product) — duplicate
  is **409**. Creating the first variant on a product auto-sets
  `Product.hasVariants = true`.
- `PATCH` body: `updateProductVariantSchema` — all optional, plus
  `status?: "ACTIVE" | "ARCHIVED"`.
- `DELETE` is a soft delete (`status = ARCHIVED`), like Products.
- Response shape (`serializeVariant`): `costPrice`/`sellingPrice` as money
  strings (`.toString()`, same unverified-precision caveat as Products
  above).
- Errors: 401, 403, 404 (product or variant not found), 409 (duplicate
  sku/barcode).

### Batches

| Method | Path | Permission |
|---|---|---|
| GET | `/batches` | `inventory.read` |
| GET | `/batches/:id` | `inventory.read` |
| POST | `/batches` | `inventory.create` |

- `GET /batches` query params: `page`, `pageSize`, `warehouseId`,
  `productId`, `expiringBefore` (ISO date). Sorted by `expiryDate` asc,
  then `createdAt` desc.
- `POST` body: `createBatchSchema` —
  `{ warehouseId, productId, variantId?, batchNumber (1-64), expiryDate?: date, quantity: quantity ≥ 0 (default 0), costPrice?: money }`.
  `warehouseId`/`productId`/`variantId` re-resolved against the tenant.
  `(businessId, warehouseId, productId, variantId, batchNumber)` must be
  unique — duplicate is **409**.
- **Batches are metadata only** — creating a `Batch` does **not** call
  `applyStockMovement` and does not affect `StockLevel`. There is no
  observed code path linking `Batch.quantity` back to the stock ledger; it
  is tracked independently (e.g. for expiry reporting). Treat this as a
  separate concern from stock-on-hand, not a source of truth for it.
- Response shape: `quantity` and `costPrice` as money/quantity strings.
- Errors: 401, 403, 404 (warehouse/product/variant not found), 409
  (duplicate batch number for this product+warehouse+variant).

### Stock Levels (read-only)

| Method | Path | Permission |
|---|---|---|
| GET | `/inventory/stock-levels` | `inventory.read` |
| GET | `/inventory/stock-levels/low-stock` | `inventory.read` |
| GET | `/inventory/stock-levels/valuation` | `inventory.read` |

- `GET /inventory/stock-levels` query: `page`, `pageSize`, `warehouseId`,
  `productId`. Response items: `quantity`, `reservedQuantity`,
  `reorderLevel` as strings (`serializeStockLevel`).
- `GET /inventory/stock-levels/low-stock` query: `page`, `pageSize`,
  `warehouseId`. Only products with `trackStock = true` and a non-null
  `lowStockThreshold` participate; comparison is done in application code
  with `Prisma.Decimal`, never SQL, because threshold and quantity live on
  different tables. Each item is augmented with a nested `product: { id, name, sku, lowStockThreshold }`.
- `GET /inventory/stock-levels/valuation` query: `warehouseId?`. Response:
  `{ totalValue: string, byWarehouse: [{ warehouseId, value: string }] }`.
  Valuation = `SUM(quantity * unitCost)` where `unitCost` prefers the
  variant's `costPrice` and falls back to the product's `costPrice` — all
  `Prisma.Decimal` arithmetic, values `.toFixed(2)`.
- Errors: 401, 403.

### Stock Movements — the ledger (read-only)

| Method | Path | Permission |
|---|---|---|
| GET | `/inventory/movements` | `inventory.read` |
| GET | `/inventory/movements/:id` | `inventory.read` |

- **There is no `POST` route on this router**, by design — see
  `docs/04-API/transactional-invariants.md` §1. Every `StockMovement` is
  created by `applyStockMovement`, invoked only from within the
  adjustments/transfers/sales/purchases/returns transactions.
- `GET /inventory/movements` query: `page`, `pageSize`, `warehouseId`,
  `productId`, `variantId`, `type` (one of `PURCHASE_IN`, `SALE_OUT`,
  `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`,
  `RETURN_IN`, `RETURN_OUT`, `OPENING_BALANCE`), `referenceType`,
  `referenceId`, `from`/`to` (created-at date range).
- Response items: `quantity` (signed, string) and `unitCost` (string or
  `null`) via `serializeMovement`.
- Errors: 401, 403, 404 (`Stock movement not found`).

### Stock Adjustments

| Method | Path | Permission |
|---|---|---|
| GET | `/inventory/adjustments` | `inventory.read` |
| GET | `/inventory/adjustments/:id` | `inventory.read` |
| POST | `/inventory/adjustments` | `inventory.adjust` |

- `GET` query: `page`, `pageSize`, `warehouseId`, `reason` (one of
  `DAMAGE`, `THEFT`, `EXPIRY`, `RECOUNT`, `OTHER`).
- `POST` body: `createStockAdjustmentSchema` —
  `{ warehouseId, reason, reference?: string (max 64), notes?: string (max 500), items: [{ productId, variantId?, quantityDelta: number ≠ 0, unitCost?: money }] (min 1) }`.
  `quantityDelta` may be positive or negative; sign determines
  `ADJUSTMENT_IN` vs `ADJUSTMENT_OUT`. `warehouseId` and every
  `productId`/`variantId` are re-resolved against the tenant before any
  write (404 otherwise).
- Transactionally: creates the `StockAdjustment` row
  (`status: APPLIED`), then for each item calls `applyStockMovement`
  followed by creating a `StockAdjustmentItem` with `movementId` set —
  never a bare adjustment line. Writes an `AuditLog` row.
  A negative-driving adjustment is rejected **409** by
  `applyStockMovement` itself (see invariants doc §1) before any partial
  write is committed.
- Response: the created adjustment with `items` (each item's
  `quantityDelta`/`unitCost` as strings via `serializeAdjustmentItem`),
  status 201.
- Errors: 401, 403, 404 (warehouse/product/variant not found), 409 (would
  drive stock negative).

### Stock Transfers

| Method | Path | Permission |
|---|---|---|
| GET | `/inventory/transfers` | `inventory.read` |
| GET | `/inventory/transfers/:id` | `inventory.read` |
| POST | `/inventory/transfers` | `inventory.transfer` |
| POST | `/inventory/transfers/:id/receive` | `inventory.transfer` |

- `GET` query: `page`, `pageSize`, `warehouseId` (matches either leg via
  `OR`), `status` (`PENDING`/`IN_TRANSIT`/`COMPLETED`/`CANCELLED`).
- `POST /inventory/transfers` body: `createStockTransferSchema` —
  `{ fromWarehouseId, toWarehouseId (must differ — 400 otherwise), reference?, notes?, items: [{ productId, variantId?, quantity: positive number }] (min 1) }`.
  Creates the `StockTransfer` (`status: IN_TRANSIT`) and, for every item,
  runs `assertSufficientStock` then `applyStockMovement`
  (`TRANSFER_OUT`, negative) against `fromWarehouseId` **immediately on
  dispatch** — stock is decremented at creation time, not at receive time.
  Each `StockTransferItem.outboundMovementId` is set.
- `POST /inventory/transfers/:id/receive` body: `receiveStockTransferSchema` —
  `{ notes?: string (max 500) }`. Rejected **409** unless the transfer's
  `status` is currently `IN_TRANSIT` (idempotent against double-receive —
  a transfer already `COMPLETED` or `CANCELLED` cannot be received again).
  For every item without an existing `inboundMovementId`, applies a
  `TRANSFER_IN` movement against `toWarehouseId`, then sets
  `status = COMPLETED`, `completedAt = now`.
- Total quantity across both warehouses is conserved once both legs have
  run (out on dispatch, in on receive) — see invariants doc §1.
- Errors: 401, 403, 400 (same source/destination warehouse), 404
  (warehouse/product/variant/transfer not found), 409 (insufficient
  stock at dispatch, or receiving a non-`IN_TRANSIT` transfer).

---

## Phase 3 — Sales / POS

Source verified: `apps/api/src/modules/sales/*` on `cursor/api-sales-95e7`.
Mounted as `/sales` and `/invoices`.

### Sales

| Method | Path | Permission |
|---|---|---|
| POST | `/sales` | `sales.create` |
| GET | `/sales` | `sales.read` |
| GET | `/sales/:id` | `sales.read` |
| POST | `/sales/:id/return` | `sales.update` |
| POST | `/sales/:id/payment` | `debts.collect` |

> **RBAC gap**: `POST /sales/:id/payment` requires `debts.collect`, not a
> `payments.*` permission — there is no `payments.*` family. See
> `docs/05-RBAC/rbac-matrix.md`.

- `POST /sales` body: `createSaleSchema` —
  `{ branchId, warehouseId, customerId?, type: "CASH" | "CREDIT" (default CASH), items: [{ productId, variantId?, quantity: positive, unitPrice: positive (IGNORED server-side), discountAmount?: money (default 0), taxAmount?: money (default 0, IGNORED server-side) }] (min 1), discountAmount?: money (default 0), notes?, dueDate?: date }`.
  `customerId` and `dueDate` are **required when `type = "CREDIT"`**
  (schema-level `.refine()` — violating this is a 400 `VALIDATION_ERROR`,
  not a 422). Server recomputes `unitPrice`/`costPrice`/`taxRate` from the
  tenant's own catalogue and ignores the client's `unitPrice`/`taxAmount`
  for every line — see transactional-invariants doc §7.
  Full ordered transaction described in transactional-invariants doc §5.1
  (cash) / §5.2 (credit).
- Response (201): serialized sale + `items` + `invoice` + `payment`
  (non-null only for cash) + `debt` (non-null only for credit) +
  `customerBalance` (non-null only for credit).
- `GET /sales` query: `page`, `pageSize`, `branchId`, `warehouseId`,
  `customerId`, `type`, `status`, `search` (matches `saleNumber`),
  `dateFrom`/`dateTo` (on `soldAt`), `sortBy` (one of `soldAt`,
  `createdAt`, `totalAmount`, `saleNumber`; default `soldAt`), `sortOrder`
  (`asc`/`desc`, default `desc`).
- `GET /sales/:id` response: serialized sale + `items` + `invoice` +
  `payments[]` + `debt`.
- `POST /sales/:id/return` body: `createSalesReturnSchema` —
  `{ reason?: string (max 500), items: [{ saleItemId, quantity: positive }] (min 1) }`.
  Each `saleItemId` must belong to this sale (404 otherwise). Return
  quantity (this return + all prior non-cancelled returns against the same
  `SaleItem`) is rejected **409** if it would exceed the originally sold
  quantity. Creates `RETURN_IN` movements (restocking) and a
  `SalesReturn` + `SalesReturnItem` rows, reduces the linked invoice's
  `totalAmount`/`amountPaid`/`amountDue`/`status` (floored at 0), reduces
  the linked debt's `principalAmount`/`outstandingAmount` (floored at 0),
  and recalculates `Customer.currentBalance`. Response (201): serialized
  return + items + updated invoice + updated debt + `customerBalance`.
- `POST /sales/:id/payment` body: `createSalePaymentSchema` —
  `{ amount: positive money, method: "CASH"|"MOBILE_MONEY"|"BANK_TRANSFER"|"CARD"|"CREDIT_NOTE"|"OTHER", reference?, notes?, paidAt?: date }`.
  Rejected **409** if the invoice is already `PAID` or `VOID`, or if
  `amount` exceeds `amountDue`. Full mechanism in transactional-invariants
  doc §5.4. Response (201): `{ payment, invoice, debt, customerBalance }`.
- Errors: 400 (schema `.refine()` failures, e.g. missing `dueDate` for a
  credit sale), 401, 403, 404 (branch/warehouse/customer/product/variant/
  sale/invoice/sale-item not found), 409 (insufficient stock, credit
  ineligible, invoice already paid/void, overpayment, over-return).

### Invoices

| Method | Path | Permission |
|---|---|---|
| GET | `/invoices` | `sales.read` |
| GET | `/invoices/:id` | `sales.read` |
| GET | `/invoices/:id/receipt` | `sales.read` |

- `GET /invoices` query: `page`, `pageSize`, `status`, `customerId`,
  `overdueOnly` (`"true"` → `dueDate < now AND status NOT IN (PAID, VOID)`),
  `search` (matches `invoiceNumber`), `dateFrom`/`dateTo` (on `issuedAt`).
- `GET /invoices/:id` response: serialized invoice + `sale` (with items) +
  `payments[]` + `debt`.
- `GET /invoices/:id/receipt` response:
  `{ business: { id, name }, invoice, sale (with items), customer, payments[] }`
  — a print/receipt-oriented composite view. 404 if the sale itself is
  missing (should not happen given the invariant that every invoice has a
  sale, but the code defends against it explicitly).
- Errors: 401, 403, 404 (invoice/sale not found).

---

## Phase 4 — Customers, Credit & Debts

Source verified: `apps/api/src/modules/customers/*` on
`cursor/api-customers-95e7`. Mounted as `/customers` and `/debts`.

### Customers

| Method | Path | Permission |
|---|---|---|
| GET | `/customers` | `customers.read` |
| POST | `/customers` | `customers.create` |
| GET | `/customers/:id` | `customers.read` |
| PATCH | `/customers/:id` | `customers.update` |
| DELETE | `/customers/:id` | `customers.update` |
| PATCH | `/customers/:id/credit-limit` | `customers.update` |
| GET | `/customers/:id/credit` | `customers.read` |
| GET | `/customers/:id/addresses` | `customers.read` |
| POST | `/customers/:id/addresses` | `customers.update` |
| PATCH | `/customers/:id/addresses/:addressId` | `customers.update` |
| DELETE | `/customers/:id/addresses/:addressId` | `customers.update` |
| GET | `/customers/:id/notes` | `customers.read` |
| POST | `/customers/:id/notes` | `customers.update` |
| GET | `/customers/:id/sales` | `customers.read` |
| GET | `/customers/:id/debts` | `debts.read` |
| GET | `/customers/:id/payments` | `debts.read` |

> **RBAC gap**: `DELETE /customers/:id` (soft-disable) requires
> `customers.update` — there is no `customers.delete`. See
> `docs/05-RBAC/rbac-matrix.md`.

- `GET /customers` query: `page`, `pageSize`, `search` (matches
  `fullName`/`phone`/`email`), `type` (`INDIVIDUAL`/`BUSINESS`), `status`,
  `sortBy` (`fullName`, `createdAt`, `currentBalance`, `creditLimit`;
  default `createdAt`), `sortOrder`.
- `POST /customers` body: `createCustomerSchema` —
  `{ type?: "INDIVIDUAL"|"BUSINESS" (default INDIVIDUAL), fullName (2-160), phone?, email?, address?, creditLimit?: money (default 0), notes? }`.
  `phone` unique per business — duplicate is **409**.
- `PATCH /customers/:id` body: `updateCustomerSchema` — same fields
  optional, plus `status?: "ACTIVE"|"ARCHIVED"`.
- `DELETE /customers/:id` is a **soft-disable** (`status = ARCHIVED`), not
  a hard delete. Rejected **409** if the customer has any non-`PAID`/
  non-`CANCELLED` `CustomerDebt`, or `currentBalance > 0`, or **any**
  historical `Invoice` at all (even fully paid ones) — a customer with
  purchase history can never be hard- or soft-deleted into an
  unreferenceable state; disabling only requires zero outstanding balance
  and zero invoice history combined, which in practice means this only
  succeeds for a customer that was created but never transacted with.
- `PATCH /customers/:id/credit-limit` body: `{ creditLimit: money }`
  (picked/required from `updateCustomerSchema`). Writes an audit metadata
  diff (`previousLimit`, `newLimit`).
- `GET /customers/:id/credit` response:
  `{ customerId, creditLimit, currentBalance, availableCredit }` (all
  strings) — runs `checkCreditEligibility` with `amount: "0"` purely to
  reuse its balance-computation logic, not to check eligibility for a real
  amount.
- Addresses: `createCustomerAddressSchema` /
  partial-of-same for update — `{ label?, line1 (1-240), line2?, city?, region?, country?, isDefault?: boolean (default false) }`.
  Setting `isDefault: true` on create/update unsets `isDefault` on every
  other address for that customer in the same transaction (at most one
  default address at a time).
- Notes: `createCustomerNoteSchema` — `{ note: string (1-2000) }`, authored
  by the current user (`authorId`). No update/delete route exists for
  notes — they are append-only.
- `GET /customers/:id/sales` — paginated `Sale[]` for this customer.
- `GET /customers/:id/debts` — all `CustomerDebt[]` for this customer,
  unpaginated, ordered by `dueDate` asc.
- `GET /customers/:id/payments` — all `DebtPayment[]` for this customer's
  debts, unpaginated, ordered by `paidAt` desc.
- Errors: 401, 403, 404 (customer/address not found), 409 (duplicate
  phone, disable blocked by outstanding balance/debt/invoice history).

### Debts

| Method | Path | Permission |
|---|---|---|
| GET | `/debts/overdue` | `debts.read` |
| GET | `/debts/due-today` | `debts.read` |
| GET | `/debts/aging` | `debts.read` |
| GET | `/debts` | `debts.read` |
| GET | `/debts/:id` | `debts.read` |
| POST | `/debts/:id/payments` | `debts.collect` |
| POST | `/debts/:id/remind` | `debts.remind` |

- `GET /debts` query: `page`, `pageSize`, `customerId`, `status`,
  `overdueOnly` (`"true"` → forces `status = OVERDUE`, overriding an
  explicit `status` param passed alongside it, since both spread into the
  same `where` object with `overdueOnly` last), `dueDateFrom`/`dueDateTo`.
- `GET /debts/overdue` — unpaginated list of `status = OVERDUE` debts.
- `GET /debts/due-today` — unpaginated list of debts due today (UTC day
  boundary via local `startOfDay()`, **not** business-timezone aware —
  flagged as a scope note, not a bug fix, in the Roadmap doc), excluding
  `PAID`/`CANCELLED`.
- `GET /debts/aging` query: `customerId?`, `asOf?` (defaults to now).
  Response: `{ asOf, buckets: { current, "1-30", "31-60", "61-90", "90+": { count, total } }, totalOutstanding }`
  — ages from `CustomerDebt.dueDate` (i.e. receivables age from the
  invoice due date, unlike payables — see Purchases section below).
- `GET /debts/:id` response: serialized debt + `payments[]` + `invoice` +
  `customer: { id, fullName, phone, email }`.
- `POST /debts/:id/payments` body: `createDebtPaymentSchema` —
  `{ amount: positive money, method, reference?, notes?, paidAt?: date }`.
  Same reconciliation mechanism as `POST /sales/:id/payment` — see
  transactional-invariants doc §5.4. Rejected **409** if the debt is
  already `PAID`/`CANCELLED`, or overpaying. Response (201):
  `{ payment, debt, invoice, customerCurrentBalance }`.
- `POST /debts/:id/remind` body: `remindDebtSchema` —
  `{ channel?: "WHATSAPP"|"SMS"|"EMAIL"|"IN_APP" (default IN_APP), message?: string (max 1000) }`.
  Rejected **409** if `outstandingAmount <= 0`. **Idempotent per calendar
  day**: if a `Notification` with the same computed `title` already exists
  for this customer created today, the existing one is returned unchanged
  (`duplicated: true`, HTTP 200) rather than sending a second reminder;
  otherwise creates the `Notification` + `NotificationLog` row (channel
  `"internal"` provider — this manual-remind path does **not** go through
  `dispatchNotification`/the channel driver pipeline used by automation;
  it writes directly with `status: SENT`) and increments
  `CustomerDebt.remindersSent`/`lastReminderAt`. Response:
  `{ debtId, notificationId, duplicated }`, status 201 (new) or 200
  (duplicate).
- Errors: 401, 403, 404 (debt not found), 409 (already settled, overpayment,
  no outstanding balance to remind about).

---

## Phase 6 — Purchases, Payables & Expenses

Source verified: `apps/api/src/modules/purchases/*` and
`apps/api/src/modules/expenses/*` on `cursor/api-purchases-95e7`. Mounted
as `/suppliers`, `/purchase-orders`, `/purchases`, `/payables`,
`/expense-categories`, `/expenses`.

### Suppliers

| Method | Path | Permission |
|---|---|---|
| GET | `/suppliers` | `purchases.read` |
| POST | `/suppliers` | `purchases.create` |
| GET | `/suppliers/:id` | `purchases.read` |
| PATCH | `/suppliers/:id` | `purchases.create` |
| DELETE | `/suppliers/:id` | `purchases.create` |
| GET | `/suppliers/:id/purchases` | `purchases.read` |
| GET | `/suppliers/:id/payments` | `purchases.read` |
| POST | `/suppliers/:id/payments` | `purchases.create` |

> **RBAC gap**: every supplier mutation (create/update/disable/payments)
> reuses `purchases.create` — there is no `suppliers.*` family. See
> `docs/05-RBAC/rbac-matrix.md`.

- `POST /suppliers` body: `createSupplierSchema` —
  `{ name (2-160), phone?, email?, address?, contactPerson?, notes? }`.
  No uniqueness constraint observed on `phone`/`email` for suppliers
  (unlike Customers, where `phone` is unique).
- `PATCH /suppliers/:id` body: `updateSupplierSchema` — same fields
  optional, plus `status?: "ACTIVE"|"ARCHIVED"`.
- `DELETE /suppliers/:id` is a **soft-disable** (`status = ARCHIVED`).
  Rejected **409** if `currentBalance > 0`, or if the supplier has **any**
  `Purchase` or `PurchaseOrder` history at all.
- `POST /suppliers/:id/payments` body: `createSupplierPaymentSchema` —
  `{ purchaseId?: string, amount: positive money, method, reference?, notes?, paidAt?: date }`.
  Two modes:
  - **Targeted** (`purchaseId` provided): applies the full `amount` to that
    one purchase; rejected **409** if it exceeds that purchase's
    `amountDue`, or **404** if the purchase doesn't belong to this
    business+supplier.
  - **FIFO on account** (`purchaseId` omitted): applies `amount` across
    the supplier's outstanding purchases ordered by `receivedAt` ascending
    (oldest first), splitting across purchases as needed; rejected **409**
    if `amount` exceeds the supplier's total outstanding balance. The
    `SupplierPayment` row itself is recorded with `purchaseId: null` in
    this mode.
  - Either way, `Supplier.currentBalance` is recalculated from the
    authoritative `Purchase.amountDue` sum afterward (see invariants doc
    §11). Response (201): `{ payment, supplierCurrentBalance }`.
- Errors: 401, 403, 404 (supplier/purchase not found), 409 (outstanding
  balance/purchase history blocks disable, overpayment).

### Purchase Orders

| Method | Path | Permission |
|---|---|---|
| GET | `/purchase-orders` | `purchases.read` |
| POST | `/purchase-orders` | `purchases.create` |
| GET | `/purchase-orders/:id` | `purchases.read` |
| POST | `/purchase-orders/:id/approve` | `purchases.create` |
| POST | `/purchase-orders/:id/cancel` | `purchases.create` |

> **RBAC gap**: no `purchase_orders.*` family — all mutations reuse
> `purchases.create`.

- `POST /purchase-orders` body: `createPurchaseOrderSchema` —
  `{ supplierId, warehouseId, expectedAt?: date, notes?, items: [{ productId, variantId?, quantity: positive, unitCost: positive money }] (min 1) }`.
  Creates a `PurchaseOrder` (`status: DRAFT`) with computed
  `subtotal`/`taxAmount (always 0)`/`totalAmount` and `PurchaseOrderItem`
  rows. **This is a non-inventory commitment**: it never calls
  `applyStockMovement`; stock only moves when the order is later received
  via `POST /purchases`.
- `POST /purchase-orders/:id/approve`: `DRAFT → SENT`. Rejected **409**
  from any other status.
- `POST /purchase-orders/:id/cancel`: rejected **409** if status is
  `RECEIVED`, `PARTIALLY_RECEIVED`, or already `CANCELLED`. Otherwise
  → `CANCELLED` from any state (including `DRAFT`, `SENT`).
- Errors: 401, 403, 404 (order/supplier/warehouse/product/variant not
  found), 409 (invalid status transition).

### Purchases (Goods Receipt)

| Method | Path | Permission |
|---|---|---|
| GET | `/purchases/returns` | `purchases.read` |
| GET | `/purchases/returns/:returnId` | `purchases.read` |
| GET | `/purchases` | `purchases.read` |
| POST | `/purchases` | `purchases.create` |
| GET | `/purchases/:id` | `purchases.read` |
| POST | `/purchases/:id/returns` | `purchases.create` |

> There is no separate `GoodsReceipt` model — `Purchase` **is** the
> goods-receipt document and the stock-incrementing transaction. See the
> Roadmap doc's scope notes.

- `GET /purchases` query: `page`, `pageSize`, `supplierId`, `warehouseId`,
  `status`, `dateFrom`/`dateTo` (on `receivedAt`).
- `POST /purchases` body: `createPurchaseSchema` —
  `{ purchaseOrderId?, supplierId, warehouseId, notes?, items: [{ productId, variantId?, quantity: positive, unitCost: positive money }] (min 1) }`.
  If `purchaseOrderId` is provided, it must belong to the same
  supplier and be `SENT` or `PARTIALLY_RECEIVED` (409 otherwise). Full
  transactional mechanism (numbering, stock movement, weighted-average
  cost update, purchase-order status advancement) documented in
  transactional-invariants doc §10. `taxAmount` is **always `0`** — the
  validation schema has no tax field for purchases (see Roadmap doc).
  Response (201): purchase + `items[]`.
- `GET /purchases/:id` response: purchase + `items[]`.
- `POST /purchases/:id/returns` body: `createPurchaseReturnSchema` —
  `{ reason?: string (max 500), items: [{ purchaseItemId, quantity: positive }] (min 1) }`.
  Each `purchaseItemId` must belong to this purchase. Return quantity
  (this + all prior non-cancelled returns against that line) rejected
  **409** if it exceeds the originally received quantity. Runs
  `assertSufficientStock` then `applyStockMovement` (`RETURN_OUT`,
  negative) — rejected **409** if the stock has already been resold and
  isn't available to return. Reduces the purchase's
  `totalAmount`/`amountDue` (floored at 0) and recalculates
  `Supplier.currentBalance`. Response (201): return + `items[]`.
- `GET /purchases/returns`, `GET /purchases/returns/:returnId` — list/get
  purchase returns (`supplierId`/`purchaseId` filters on the list).
- Errors: 401, 403, 404 (purchase/order/supplier/warehouse/product/
  variant/return not found), 409 (invalid PO status, insufficient stock on
  return, over-return quantity).

### Payables

| Method | Path | Permission |
|---|---|---|
| GET | `/payables/outstanding` | `purchases.read` |
| GET | `/payables/aging` | `purchases.read` |
| GET | `/payables/payments` | `purchases.read` |

- `GET /payables/outstanding` query: `page`, `pageSize`. Response:
  suppliers with `currentBalance > 0`, plus `meta.totalOutstanding`
  (business-wide sum, not just the current page).
- `GET /payables/aging` query: `supplierId?`, `asOf?` (defaults to now).
  **Ages from `Purchase.receivedAt`** (the goods-receipt date), **not**
  from a due date — `Purchase` has no due-date field. This is the
  opposite of customer-debt aging, which ages from `CustomerDebt.dueDate`.
  Same bucket shape as `/debts/aging`.
- `GET /payables/payments` query: `page`, `pageSize`, `supplierId?`,
  `purchaseId?`, `dateFrom`/`dateTo` (on `paidAt`) — history of
  `SupplierPayment` rows.
- Errors: 401, 403.

### Expense Categories

| Method | Path | Permission |
|---|---|---|
| GET | `/expense-categories` | `expenses.read` |
| POST | `/expense-categories` | `expenses.create` |
| GET | `/expense-categories/:id` | `expenses.read` |
| PATCH | `/expense-categories/:id` | `expenses.create` |
| DELETE | `/expense-categories/:id` | `expenses.create` |

> **RBAC gap**: update/delete reuse `expenses.create` — there is no
> `expenses.update`/`expenses.delete`.

- `POST` body: `createExpenseCategorySchema` — `{ name (1-120), description? }`.
- `PATCH` body: `updateExpenseCategorySchema` — both optional.
- Errors: 401, 403, 404 (category not found).

### Expenses

| Method | Path | Permission |
|---|---|---|
| GET | `/expenses/summary/by-category` | `expenses.read` |
| GET | `/expenses` | `expenses.read` |
| POST | `/expenses` | `expenses.create` |
| GET | `/expenses/:id` | `expenses.read` |
| PATCH | `/expenses/:id` | `expenses.create` |
| DELETE | `/expenses/:id` | `expenses.create` |

- `GET /expenses` query: `page`, `pageSize`, `categoryId`, `branchId`,
  `method`, `dateFrom`/`dateTo` (on `expenseDate`).
- `POST` body: `createExpenseSchema` —
  `{ categoryId, branchId?, amount: positive money, description (1-500), method?, reference?, expenseDate?: date (defaults to now) }`.
  `categoryId` and, if provided, `branchId` are re-resolved against the
  tenant.
- `PATCH` body: `updateExpenseSchema` — same fields optional.
- `DELETE /expenses/:id` is a **hard delete** (unlike every other
  "delete" endpoint in this audit, which soft-disables/archives) — there
  is no state that blocks it.
- `GET /expenses/summary/by-category` query: `branchId?`,
  `dateFrom`/`dateTo`. Response: `{ categories: [{ categoryId, categoryName, count, totalAmount }], totalAmount }`.
- Errors: 401, 403, 404 (expense/category/branch not found).

---

## Phase 5 — Automation & Notifications

Source verified: `apps/api/src/modules/automation/*` and
`apps/api/src/modules/notifications/*` on
`cursor/automation-worker-95e7`. Mounted as `/automation` and
`/notifications`.

> **RBAC gap**: every route in both modules requires the single
> `automation.manage` key — there is no channel- or resource-scoped
> breakdown (e.g. no separate key for "read executions" vs. "edit rules").

### Automation Rules & Executions

| Method | Path | Permission |
|---|---|---|
| GET | `/automation/rules` | `automation.manage` |
| POST | `/automation/rules` | `automation.manage` |
| GET | `/automation/rules/:id` | `automation.manage` |
| PATCH | `/automation/rules/:id` | `automation.manage` |
| DELETE | `/automation/rules/:id` | `automation.manage` |
| POST | `/automation/rules/:id/activate` | `automation.manage` |
| POST | `/automation/rules/:id/deactivate` | `automation.manage` |
| POST | `/automation/rules/:id/test` | `automation.manage` |
| GET | `/automation/executions` | `automation.manage` |
| GET | `/automation/executions/:id` | `automation.manage` |

- `GET /automation/rules` query: `page`, `pageSize`, `isActive`
  (`"true"`/`"false"`), `search` (matches `name`).
- `POST` body: `createAutomationRuleSchema` —
  `{ name (2-160), description?, isActive?: boolean (default true), triggers: [{ type: "INVOICE_DUE_SOON"|"INVOICE_DUE_TODAY"|"INVOICE_OVERDUE"|"LOW_STOCK"|"MANUAL", offsetDays?: int, config?: object }] (min 1), actions: [{ type: "SEND_WHATSAPP"|"SEND_SMS"|"SEND_EMAIL"|"CREATE_NOTIFICATION"|"WEBHOOK", order?: int ≥ 0 (default 0), templateId?, config?: object }] (min 1) }`.
  `name` unique per business — duplicate **409**. Any `templateId`
  referenced by an action must belong to this tenant (404 otherwise).
- `PATCH` body: `updateAutomationRuleSchema` — `triggers`/`actions`, when
  provided, **fully replace** the existing set (delete-all then
  create-many inside the same transaction) rather than merging/patching
  individual triggers or actions.
- `DELETE` — hard delete. Response: `{ id }`.
- `POST .../activate` / `.../deactivate` — toggle `isActive`, no state
  restrictions.
- `POST .../test` body: `testAutomationRuleSchema` — `{ debtId?: string }`.
  **Dry run only** — evaluates real trigger matches against real debt data
  (optionally scoped to one `debtId`, 404 if it doesn't resolve) but never
  dispatches a notification or writes an execution row. Response:
  `{ ruleId, ruleName, isActive, triggers: [{ triggerId, type, offsetDays, matchedCount, matchedDebts: [...] }], wouldFireActions, note }`.
- `GET /automation/executions` query: `page`, `pageSize`, `ruleId`,
  `status` (`PENDING`/`RUNNING`/`SUCCESS`/`FAILED`/`SKIPPED`),
  `dateFrom`/`dateTo`. Each item includes nested `rule: { id, name }`,
  `debt: { id, dueDate, outstandingAmount }`,
  `notifications: [{ id, channel, status }]`.
- `GET /automation/executions/:id` — full execution with `rule`,
  `trigger`, `debt`, `notifications` (each including its `logs`).
- Errors: 401, 403, 404 (rule/template/debt/execution not found), 409
  (duplicate rule name).

### Notification Templates, History & Test Send

| Method | Path | Permission |
|---|---|---|
| GET | `/notifications/templates` | `automation.manage` |
| POST | `/notifications/templates` | `automation.manage` |
| GET | `/notifications/templates/:id` | `automation.manage` |
| PATCH | `/notifications/templates/:id` | `automation.manage` |
| DELETE | `/notifications/templates/:id` | `automation.manage` |
| POST | `/notifications/templates/:id/preview` | `automation.manage` |
| GET | `/notifications` | `automation.manage` |
| GET | `/notifications/:id` | `automation.manage` |
| GET | `/notifications/:id/logs` | `automation.manage` |
| POST | `/notifications/send-test` | `automation.manage` |

- `POST /notifications/templates` body:
  `createNotificationTemplateSchema` —
  `{ key (1-80), channel: "WHATSAPP"|"SMS"|"EMAIL"|"IN_APP", subject?: string (max 160), body: string (1-4000), variables?: object (default {}), isActive?: boolean (default true) }`.
  `(businessId, key, channel)` unique — duplicate **409**.
- `PATCH` body: `updateNotificationTemplateSchema` — `subject`/`body`/
  `variables`/`isActive` optional. Updating `body` auto-increments
  `version`.
- `DELETE` — hard delete. Response: `{ id }`.
- `POST .../preview` body: `{ variables?: object }` (loose, not a named
  exported schema). Response: `{ subject, body }` with
  `{{variable}}` placeholders substituted — no notification/log rows are
  written; this is render-only.
- `GET /notifications` query: `page`, `pageSize`, `channel`, `status`
  (`PENDING`/`SENT`/`DELIVERED`/`FAILED`/`READ`), `customerId`,
  `dateFrom`/`dateTo`. Each item includes `customer: { id, fullName, phone }`
  and `template: { id, key }`.
- `GET /notifications/:id` — full notification with `logs[]` (ordered
  oldest-first) and every channel-message array
  (`whatsAppMessages`/`smsMessages`/`emailMessages`).
- `GET /notifications/:id/logs` — paginated `NotificationLog[]` for one
  notification.
- `POST /notifications/send-test` body:
  `{ templateId, to: string (min 3), variables?: object }` (a local
  `sendTestSchema`, not exported from `@daljir/validation`). Renders the
  template and calls the exact same `dispatchNotification` pipeline used
  by automation (see transactional-invariants doc §9) — full logging
  guarantee applies. Response (201): `{ notificationId, status, attempts, provider, providerMessageId }`.
- Errors: 401, 403, 404 (template/notification not found), 409 (duplicate
  template key+channel).

---

## Phase 7 — Reports & Analytics (19 endpoints)

Source verified: `apps/api/src/modules/reports/*` on
`cursor/api-reports-95e7`. Mounted as `/reports`. Every route shares the
same guard: `requireAuth, requireTenant, requirePermission("reports.read")`.
**All query-parameter validation failures in this module return 422**, not
400 — see Conventions above.

| Method | Path |
|---|---|
| GET | `/reports/dashboard` |
| GET | `/reports/sales` |
| GET | `/reports/sales/by-branch` |
| GET | `/reports/sales/by-customer` |
| GET | `/reports/sales/by-product` |
| GET | `/reports/sales/by-payment-method` |
| GET | `/reports/sales/top-products` |
| GET | `/reports/inventory/valuation` |
| GET | `/reports/inventory/movements` |
| GET | `/reports/inventory/low-stock` |
| GET | `/reports/inventory/expiring-batches` |
| GET | `/reports/inventory/slow-moving` |
| GET | `/reports/profit` |
| GET | `/reports/profit/by-product` |
| GET | `/reports/receivables/aging` |
| GET | `/reports/receivables/collections` |
| GET | `/reports/purchases` |
| GET | `/reports/expenses` |
| GET | `/reports/payables` |

- `GET /reports/dashboard` query: `asOf?` (defaults to now). Response:
  `{ asOf, today, thisWeek, thisMonth, outstandingReceivables, lowStockCount, overdueDebtCount }`
  where each of `today`/`thisWeek`/`thisMonth` is
  `{ revenue, transactionCount, grossProfit, cashCollected }` (money
  strings). Week starts Monday UTC; month starts the 1st UTC.
- `GET /reports/sales` query: `startDate?`, `endDate?`, `groupBy?`
  (`day`/`week`/`month`, default `day`), `branchId?`, `customerId?`,
  `page`, `limit`. Response:
  `{ range, totals: { revenue, discount, tax, transactionCount, averageBasketValue }, breakdown: [{ period, revenue, discount, tax, transactionCount }] }`.
- `GET /reports/sales/by-branch|by-customer|by-product` query:
  `startDate?`, `endDate?`, `page`, `limit`. Grouped/paginated breakdown
  by that dimension, `meta` total = distinct-group count (not row count).
- `GET /reports/sales/by-payment-method` query: `startDate?`, `endDate?`
  (no pagination — small, fixed cardinality). Response includes
  `meta.totalAmount`.
- `GET /reports/sales/top-products` query: `startDate?`, `endDate?`,
  `sortBy?` (`quantity`/`revenue`, default `revenue`), `limit` (max 100,
  default 10, **no `page`** — this is a fixed top-N, not a paginated
  list).
- `GET /reports/inventory/valuation` query: `warehouseId?`, `page`,
  `limit`. Response: `{ totalValuation, totalQuantity, byWarehouse: [...] }`.
  (Uses raw SQL to join `StockLevel` with cost price — see
  `reports/lib/raw.ts`. This is a *separate* implementation from
  `GET /inventory/stock-levels/valuation` in the Inventory module; both
  compute a similar total but were not observed to share code — verify
  they agree before treating them as interchangeable.)
- `GET /reports/inventory/movements` query: `startDate?`, `endDate?`,
  `warehouseId?` (default range 30 days). Response:
  `{ range, byType: [{ type, quantity, movementCount }] }`.
- `GET /reports/inventory/low-stock` query: `warehouseId?`, `page`,
  `limit`. Each row includes `status: "OUT_OF_STOCK" | "LOW_STOCK"`.
- `GET /reports/inventory/expiring-batches` query: `warehouseId?`,
  `days?` (0-730, default 30), `page`, `limit`. Each row includes
  `isExpired: boolean`.
- `GET /reports/inventory/slow-moving` query: `warehouseId?`, `days?`
  (1-365, default 30), `page`, `limit`. "Slow moving" = positive
  `StockLevel.quantity` with **zero** `SALE_OUT` movements in the window
  — computed by loading up to 5000 stock-level rows and a
  `groupBy` of recent sale-out movements, then filtering in application
  code (not a single SQL query) — **flagged for scale concern**: the
  hard-coded `take: 5000` cap means a business with more than 5000
  distinct stock lines will silently see an incomplete slow-moving report
  with no error or warning.
- `GET /reports/profit` query: `startDate?`, `endDate?`, `groupBy?`
  (default `day`). Response: `{ range, totals: { revenue, cost, grossProfit, marginPercent }, breakdown: [...] }`.
  `marginPercent` is `"0.00"` when revenue is zero (guarded, not a
  divide-by-zero).
- `GET /reports/profit/by-product` query: `startDate?`, `endDate?`,
  `page`, `limit`.
- `GET /reports/receivables/aging` query: `asOf?`, `page`, `limit`. Loads
  up to 20000 open debts (`MAX_OPEN_DEBTS`) before bucketing/pagination —
  same class of scale flag as slow-moving, at a higher cap. Response:
  `{ asOf, totalOutstanding, buckets: [...], byCustomer: [...] }`
  (paginated on `byCustomer` only; `buckets` is always complete).
- `GET /reports/receivables/collections` query: `startDate?`, `endDate?`
  (no pagination). Response: `{ range, totalCollected, paymentCount, byMethod: [...] }`
  — based on `DebtPayment`, not `Payment` (i.e. cash-sale payments that
  never touched a `CustomerDebt` are excluded from "collections").
- `GET /reports/purchases` query: `startDate?`, `endDate?`, `groupBy?`,
  `supplierId?`, `page`, `limit`. Response includes both a time-bucketed
  `breakdown` and a paginated `bySupplier` (with `meta` = distinct
  supplier count).
- `GET /reports/expenses` query: `startDate?`, `endDate?`, `categoryId?`,
  `page`, `limit`. Grouped by category.
- `GET /reports/payables` query: `supplierId?`, `page`, `limit`.
  Response: `{ totalPayable, suppliers: [{ supplierId, supplierName, supplierPhone, outstandingBalance }] }`.
- Errors: 401, 403, **422** (invalid/oversized/inverted date range,
  out-of-bounds `page`/`limit`/`days` — see Conventions above; note this
  is **422**, not 400, unlike every other module).

---

## Phase 8 — Super Admin

> **Not verified in this audit** — these routes belong to the shared
> foundation layer (present identically across all six branches) and are
> outside the six domains this document set out to verify. A quick read of
> `apps/api/src/modules/admin/admin.routes.ts` shows the actual mounted
> paths are `GET /admin/overview`, `GET /admin/businesses`,
> `GET /admin/users`, `GET /admin/system-health`, `GET /admin/audit-logs`
> (all behind `requirePlatformAdmin`, not a business permission key) —
> this **differs** from the `GET /admin/subscriptions` entry below, which
> does not appear to exist in the shipped router. Flagged as a discrepancy
> for a future audit of the admin module specifically; left unchanged here
> since Super Admin was not part of this task's scope.

GET /admin/businesses
GET /admin/users
GET /admin/subscriptions
GET /admin/system-health
GET /admin/audit-logs
