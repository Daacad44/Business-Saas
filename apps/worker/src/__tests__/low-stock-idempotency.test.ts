import type { AutomationTrigger } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { attemptCreateStockExecution } from "../automation/create-execution.js";
import { executeActions } from "../automation/execute-actions.js";
import { findLowStockMatches } from "../automation/trigger-evaluator.js";
import { prisma } from "../lib/prisma.js";
import { createLowStockRule, createStockLevel, createTestProduct, createTestTenant } from "./test-helpers.js";

/**
 * Runs one "scan pass" for a single (rule, trigger, stock line) tuple —
 * the same create-execution + dispatch sequence the real
 * `debt-scan.job.ts` / `notification-dispatch.job.ts` pair performs for
 * every LOW_STOCK match it finds, without scanning every rule in the
 * database (keeping this test hermetic to its own tenant).
 */
async function scanOnce(
  businessId: string,
  ruleId: string,
  trigger: Pick<AutomationTrigger, "id" | "type">,
  stockLevelId: string,
) {
  const { created, executionId } = await attemptCreateStockExecution(businessId, ruleId, trigger, stockLevelId);
  if (created) {
    await executeActions(executionId);
  }
  return { created, executionId };
}

describe("LOW_STOCK idempotency", () => {
  it("two consecutive scans of the same still-low stock line produce exactly ONE AutomationExecution and ONE Notification", async () => {
    const tenant = await createTestTenant("LowStockIdempotency");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 10 });
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 2);
    const { rule, trigger } = await createLowStockRule(tenant.businessId, "CREATE_NOTIFICATION");

    // Sanity: the line really matches before we exercise idempotency.
    const matches = await findLowStockMatches(tenant.businessId);
    expect(matches.some((m) => m.stockLevelId === level.id)).toBe(true);

    const first = await scanOnce(tenant.businessId, rule.id, trigger, level.id);
    expect(first.created).toBe(true);

    const second = await scanOnce(tenant.businessId, rule.id, trigger, level.id);
    expect(second.created).toBe(false);
    expect(second.executionId).toBe(first.executionId);

    const executions = await prisma.automationExecution.findMany({
      where: { businessId: tenant.businessId, ruleId: rule.id, stockLevelId: level.id },
    });
    expect(executions).toHaveLength(1);

    const notifications = await prisma.notification.findMany({
      where: { businessId: tenant.businessId, executionId: first.executionId },
    });
    expect(notifications).toHaveLength(1);
  });

  it("never crashes on a concurrent duplicate create for the same idempotency key", async () => {
    const tenant = await createTestTenant("LowStockConcurrent");
    const product = await createTestProduct(tenant.businessId, { lowStockThreshold: 10 });
    const level = await createStockLevel(tenant.businessId, tenant.warehouseId, product.id, 1);
    const { rule, trigger } = await createLowStockRule(tenant.businessId, "CREATE_NOTIFICATION");

    const results = await Promise.allSettled([
      attemptCreateStockExecution(tenant.businessId, rule.id, trigger, level.id),
      attemptCreateStockExecution(tenant.businessId, rule.id, trigger, level.id),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const executionCount = await prisma.automationExecution.count({
      where: { businessId: tenant.businessId, ruleId: rule.id, stockLevelId: level.id },
    });
    expect(executionCount).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
