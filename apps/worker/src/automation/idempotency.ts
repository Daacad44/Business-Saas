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
