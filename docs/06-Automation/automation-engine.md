# Automation Engine

## Generic Model

```text
TRIGGER
  -> CONDITIONS
  -> ACTIONS
  -> EXECUTION LOG
```

## Example: Debt Reminder

```text
Trigger: invoice due-date event
Condition: outstandingAmount > 0
Action: send WhatsApp template
Action: create notification
Action: write audit/execution log
```

## Queue Architecture

```text
API
 -> Redis
 -> BullMQ
 -> Worker
 -> Provider
 -> Delivery webhook
 -> NotificationLog
```

## Requirements
- Idempotency keys
- Retry with backoff
- Dead-letter handling
- Delivery status tracking
- Template versioning
- Per-business channel configuration
- Quiet hours / anti-spam controls
- Maximum reminder limits
- Timezone-aware scheduling

## Debt statuses: settlement vs calendar

Serialized `CustomerDebt.status` is **settlement only**:

```text
PENDING
PARTIALLY_PAID
PAID
CANCELLED
```

It is **never** `OVERDUE`, `DUE_SOON`, or `DUE_TODAY`. Those Prisma enum members still exist because dropping a Postgres enum value is a destructive migration; they are dead. Overdue and due-today are derived at read time from `dueDate` + `Business.timezone` + `outstandingAmount > 0` (and status not in `{PAID, CANCELLED}`).

Use the helpers in `apps/api/src/modules/customers/timezone.ts`:

- `overdueDebtWhere(asOf, timeZone)`
- `dueTodayDebtWhere(asOf, timeZone)`
- `debtStatusQueryWhere("OVERDUE" | "DUE_TODAY", asOf, timeZone)`

List endpoints compose those predicates in `apps/api/src/modules/customers/debt-query.ts`. Query aliases `GET /debts?status=OVERDUE` and `status=DUE_TODAY` map onto the helpers; `status=DUE_SOON` is **422** (there is no canonical due-soon window).

Canonical write-up: `docs/04-API/transactional-invariants.md` (§ `DebtStatus.OVERDUE` / `DUE_SOON` / `DUE_TODAY` are dead values).

**Do not write a job that transitions rows into `DebtStatus.OVERDUE`, `DUE_SOON`, or `DUE_TODAY`.** That job would recreate two competing definitions (stored flag vs live predicate). The stored flag would go stale the moment the business timezone rolls midnight. Automation triggers such as `INVOICE_OVERDUE` / `INVOICE_DUE_TODAY` / `INVOICE_DUE_SOON` must query the helpers (or an equivalent live `dueDate` predicate), not denormalize a calendar status onto the debt row.
