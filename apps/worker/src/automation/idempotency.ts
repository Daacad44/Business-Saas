import type { AutomationTrigger, CustomerDebt } from "@prisma/client";

/**
 * Deterministic idempotency key for a (rule, debt, trigger, due-date)
 * tuple: `${ruleId}:${debtId}:${triggerOffsetDays}:${dueDateISO}`.
 * Mirrors `apps/api/src/modules/automation/idempotency.ts`.
 */
export function buildAutomationIdempotencyKey(
  ruleId: string,
  debt: Pick<CustomerDebt, "id" | "dueDate">,
  trigger: Pick<AutomationTrigger, "type" | "offsetDays">,
): string {
  const offsetPart = trigger.offsetDays ?? trigger.type;
  const dueDateISO = debt.dueDate.toISOString().slice(0, 10);
  return `${ruleId}:${debt.id}:${offsetPart}:${dueDateISO}`;
}

/**
 * The logical "period" a LOW_STOCK scan belongs to: the current UTC
 * calendar day, formatted `YYYY-MM-DD`. Exposed separately so callers
 * (and tests) can pin it explicitly.
 */
export function currentLowStockPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Deterministic idempotency key for a stock-based (LOW_STOCK) trigger
 * match, coherent with the debt-based formula above:
 *
 *   `${ruleId}:${debtId}:${triggerOffsetDays ?? triggerType}:${dueDateISO}`   (debt-based)
 *   `${ruleId}:${stockLevelId}:${triggerType}:${periodISO}`                  (stock-based)
 *
 * A stock-based trigger has no `debtId` and no `dueDate`, so those two
 * slots are filled with the stock line's own identity (`stockLevelId`,
 * which plays the same "which entity is this about" role as `debtId`)
 * and a PERIOD marker (`periodISO`, which plays the same "which point in
 * time is this about" role as `dueDateISO`).
 *
 * PERIOD SEMANTICS (design decision): the period is the current UTC
 * calendar day. A rescan of the SAME still-low stock line within the
 * SAME day reuses the identical key and hits the unique-constraint
 * no-op path — no duplicate execution or notification (CLAUDE.md rule
 * 8). On the NEXT calendar day the period advances, so a stock line that
 * is STILL low gets exactly one fresh notification per day rather than
 * being silenced forever after the first alert, or re-notified on every
 * scan interval (which for a 15-minute scan cadence would be far too
 * noisy). This mirrors how a debt's `dueDateISO` naturally changes only
 * once per day even though the debt scan itself may run many times a day.
 */
export function buildStockAutomationIdempotencyKey(
  ruleId: string,
  stockLevelId: string,
  triggerType: AutomationTrigger["type"],
  periodISO: string = currentLowStockPeriod(),
): string {
  return `${ruleId}:${stockLevelId}:${triggerType}:${periodISO}`;
}
