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

## Suggested Debt States
PENDING
DUE_SOON
DUE_TODAY
OVERDUE
PARTIALLY_PAID
PAID
CANCELLED
