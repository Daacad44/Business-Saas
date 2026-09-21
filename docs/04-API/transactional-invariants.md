# Transactional Invariants — Debts, Overdue, and Receivables

This document records a deliberate product decision about `DebtStatus` so a
future engineer does not "helpfully" add a status-transition job and
reintroduce two competing definitions of overdue.

## Overdue and due-today are derived, never stored

A debt is **overdue** when, in the business's own timezone
(`Business.timezone`, IANA string, default `Africa/Mogadishu`):

1. it still has a **positive outstanding balance** (`outstandingAmount > 0`,
   compared as `Prisma.Decimal` — never floating point), and
2. its `dueDate` is **strictly before** the start of the calendar day
   containing "now" (or the caller's `asOf`).

A debt is **due today** when (1) holds and `dueDate` falls on that same
calendar day. Equivalence: overdue iff
`calendarDaysBetweenInTimezone(dueDate, asOf, timezone) > 0` for any open
debt.

These facts are computed at read time. They are not a column value.

## `DebtStatus.OVERDUE` / `DUE_SOON` / `DUE_TODAY` are dead values

The Postgres / Prisma enum still contains `DUE_SOON`, `DUE_TODAY`, and
`OVERDUE` next to the settlement statuses that **are** written
(`PENDING`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`).

**This is a deliberate decision with a recorded rationale.** Removing a
value from a Postgres enum is not an additive migration — it requires
recreating the type and rewriting the column, which is the kind of
destructive schema surgery this codebase forbids. The payoff would only
be cleanliness. The important half is already done: the read side is
authoritative.

So:

- `DebtStatus.OVERDUE`, `DUE_SOON`, and `DUE_TODAY` are retained in the
  schema but are **NEVER written** by application code and **must not be
  read as a source of truth**.
- Do not add a cron / automation / dunning job that transitions rows
  into those enum values. That job would reintroduce two competing
  definitions (the stored flag vs the live predicate) and the stored
  flag would go stale the moment a calendar day rolls over in the
  business timezone.
- Any future automation or dunning logic **must** use the canonical
  helpers below rather than a denormalized flag.

The settlement statuses `PENDING`, `PARTIALLY_PAID`, `PAID`, and
`CANCELLED` **are** written (payment collection, cancellation) and
**are** a source of truth for "is this debt still open".

## Canonical helpers

All live in `apps/api/src/modules/customers/timezone.ts`:

| Helper | Meaning |
| --- | --- |
| `openOutstandingDebtWhere()` | Positive outstanding balance, status not in `{PAID, CANCELLED}` |
| `overdueDebtWhere(asOf, timeZone)` | Open + `dueDate` before start of `asOf`'s business calendar day |
| `dueTodayDebtWhere(asOf, timeZone)` | Open + `dueDate` on `asOf`'s business calendar day |
| `debtStatusQueryWhere("OVERDUE" \| "DUE_TODAY", asOf, timeZone)` | Query-string aliases onto the two calendar predicates |
| `calendarDaysBetweenInTimezone(earlier, later, timeZone)` | Whole calendar-day distance used by aging buckets |

List endpoints compose those predicates in
`apps/api/src/modules/customers/debt-query.ts` (`buildDebtListWhere`).
Do not copy a `dueDate < now` filter into a new module; import the
helper.

## Surfaces that must agree

These five (plus the `status=` aliases) are the same overdue set:

1. `GET /debts?overdueOnly=true`
2. `GET /debts/overdue`
3. `GET /debts/aging` (non-`current` buckets)
4. `GET /reports/receivables/aging` (non-`current` buckets)
5. `GET /reports/dashboard` → `overdueDebtCount`

`GET /debts?status=OVERDUE` and `GET /customers/:id/debts?status=OVERDUE`
map onto `overdueDebtWhere`, so a frontend that builds its status
dropdown from the `DebtStatus` type gets the live overdue set rather
than a silently empty list. `status=DUE_TODAY` maps onto
`dueTodayDebtWhere` (same set as `GET /debts/due-today`).

`status=DUE_SOON` is **rejected with 422**. There is no canonical
due-soon window in the product; inventing one here would create a third
definition the moment automation later picks 3 days or 7 days. The 422
names the supported alternatives (`status=DUE_TODAY` / `/debts/due-today`,
`status=OVERDUE` / `overdueOnly=true` / `/debts/overdue`).

`GET /reports/dashboard` → `outstandingReceivables` uses
`openOutstandingDebtWhere()`, matching both aging totals. Cancelled
debts that still carry a leftover balance are excluded.

## Response `status` is the settlement status

A debt returned from `GET /debts?status=OVERDUE` still serializes
`status: "PENDING"` or `"PARTIALLY_PAID"`. That field is the stored
settlement status, not the calendar classification. Clients that need
"is this overdue" should use the filter / dedicated endpoints, not
compare the serialized `status` to `"OVERDUE"`.
