import type { AutomationTrigger, CustomerDebt } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { buildAutomationIdempotencyKey } from "./idempotency.js";

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "P2002",
  );
}

export type AttemptCreateExecutionResult = {
  /** false when this exact (rule, debt, trigger, dueDate) tuple already has an execution — a safe no-op. */
  created: boolean;
  executionId: string;
};

/**
 * Attempts to create an `AutomationExecution` row keyed by a deterministic
 * idempotency key. A unique-constraint violation on that key means this
 * exact tuple was already scanned (possibly by an earlier run of the same
 * scheduled scan) — this is handled as a safe no-op (CLAUDE.md rule 8),
 * never a crash.
 */
export async function attemptCreateExecution(
  businessId: string,
  ruleId: string,
  trigger: Pick<AutomationTrigger, "id" | "type" | "offsetDays">,
  debt: CustomerDebt,
): Promise<AttemptCreateExecutionResult> {
  const idempotencyKey = buildAutomationIdempotencyKey(ruleId, debt, trigger);
  try {
    const execution = await prisma.automationExecution.create({
      data: {
        businessId,
        ruleId,
        triggerId: trigger.id,
        debtId: debt.id,
        status: "PENDING",
        idempotencyKey,
        attempt: 1,
      },
    });
    logger.info("Created automation execution", { businessId, ruleId, debtId: debt.id, idempotencyKey, executionId: execution.id });
    return { created: true, executionId: execution.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.automationExecution.findUnique({ where: { idempotencyKey } });
      logger.info("Execution already exists for idempotency key — no-op", {
        businessId,
        ruleId,
        debtId: debt.id,
        idempotencyKey,
        executionId: existing?.id,
      });
      return { created: false, executionId: existing?.id ?? "" };
    }
    throw error;
  }
}
