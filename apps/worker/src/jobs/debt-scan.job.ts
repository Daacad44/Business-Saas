import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { attemptCreateExecution } from "../automation/create-execution.js";
import { findMatchingDebts } from "../automation/trigger-evaluator.js";

export type DebtScanResult = {
  businessesScanned: number;
  rulesEvaluated: number;
  matchesFound: number;
  executionsCreated: number;
  executionsSkipped: number;
};

/**
 * Scans `CustomerDebt` rows across ALL businesses for upcoming due-dates
 * and overdue balances, evaluating each business's own active
 * `AutomationRule` set against ONLY that business's own debts (strict
 * per-business isolation — every read and write below carries the
 * `businessId` it was scoped from).
 *
 * For every match it atomically creates (or no-ops on) an
 * `AutomationExecution` and, only for a freshly created execution,
 * hands the executionId off via `enqueueDispatch` so the actual
 * notification send happens on the separate notification-dispatch queue.
 */
export async function runDebtScan(enqueueDispatch: (executionId: string) => Promise<void>): Promise<DebtScanResult> {
  const rules = await prisma.automationRule.findMany({
    where: { isActive: true },
    include: { triggers: true },
  });

  const businessIds = new Set<string>();
  let matchesFound = 0;
  let executionsCreated = 0;
  let executionsSkipped = 0;

  for (const rule of rules) {
    businessIds.add(rule.businessId);

    for (const trigger of rule.triggers) {
      const debts = await findMatchingDebts(rule.businessId, trigger);

      for (const debt of debts) {
        // Defensive re-assertion of tenant scoping even though
        // `findMatchingDebts` already filters by businessId.
        if (debt.businessId !== rule.businessId) {
          logger.error("Cross-business debt leak detected — skipping", {
            businessId: rule.businessId,
            debtBusinessId: debt.businessId,
            debtId: debt.id,
          });
          continue;
        }

        matchesFound += 1;
        const { created, executionId } = await attemptCreateExecution(rule.businessId, rule.id, trigger, debt);

        if (created) {
          executionsCreated += 1;
          await enqueueDispatch(executionId);
        } else {
          executionsSkipped += 1;
        }
      }
    }
  }

  const result: DebtScanResult = {
    businessesScanned: businessIds.size,
    rulesEvaluated: rules.length,
    matchesFound,
    executionsCreated,
    executionsSkipped,
  };

  logger.info("Debt scan completed", result);
  return result;
}
