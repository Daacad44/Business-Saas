import type { AutomationTrigger, CustomerDebt } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { buildAutomationIdempotencyKey, buildStockAutomationIdempotencyKey } from "./idempotency.js";

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

/**
 * Same idempotent-create pattern as `attemptCreateExecution`, but for a
 * stock-based (LOW_STOCK) trigger match — see
 * `buildStockAutomationIdempotencyKey` for the key formula and period
 * semantics. A repeated scan of the same still-low stock line within the
 * same logical period safely no-ops instead of creating a duplicate
 * execution (CLAUDE.md rule 8).
 */
export async function attemptCreateStockExecution(
  businessId: string,
  ruleId: string,
  trigger: Pick<AutomationTrigger, "id" | "type">,
  stockLevelId: string,
): Promise<AttemptCreateExecutionResult> {
  const idempotencyKey = buildStockAutomationIdempotencyKey(ruleId, stockLevelId, trigger.type);
  try {
    const execution = await prisma.automationExecution.create({
      data: {
        businessId,
        ruleId,
        triggerId: trigger.id,
        stockLevelId,
        status: "PENDING",
        idempotencyKey,
        attempt: 1,
      },
    });
    logger.info("Created automation execution (low stock)", {
      businessId,
      ruleId,
      stockLevelId,
      idempotencyKey,
      executionId: execution.id,
    });
    return { created: true, executionId: execution.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.automationExecution.findUnique({ where: { idempotencyKey } });
      logger.info("Execution already exists for idempotency key — no-op", {
        businessId,
        ruleId,
        stockLevelId,
        idempotencyKey,
        executionId: existing?.id,
      });
      return { created: false, executionId: existing?.id ?? "" };
    }
    throw error;
  }
}
