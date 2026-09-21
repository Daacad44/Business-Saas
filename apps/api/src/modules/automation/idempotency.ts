import type { AutomationTrigger, CustomerDebt } from "@prisma/client";

/**
 * Deterministic idempotency key for a (rule, debt, trigger, due-date) tuple.
 *
 * Format: `${ruleId}:${debtId}:${triggerOffsetDays}:${dueDateISO}`
 *
 * `dueDateISO` is truncated to the calendar day so that re-running the scan
 * multiple times within the same day for the same debt/trigger never
 * produces more than one `AutomationExecution` row (CLAUDE.md rule 8).
 * `triggerOffsetDays` falls back to the trigger type for triggers that have
 * no offset (e.g. INVOICE_DUE_TODAY, INVOICE_OVERDUE, MANUAL) so the key
 * stays unique across trigger types.
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
