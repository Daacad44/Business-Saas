import { createTriggerEvaluator } from "@daljir/automation";
import { testAutomationRuleSchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";

const { findMatchingDebts, findLowStockMatches } = createTriggerEvaluator({ prisma });

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

/**
 * Dry-run / test endpoint. Evaluates a rule's triggers against REAL debt
 * and stock data for this tenant and reports which entities WOULD match
 * and which actions WOULD fire — it never sends anything and never writes
 * a `Notification`, `NotificationLog`, or channel-message row.
 *
 * Trigger matching is the SAME implementation the BullMQ worker uses
 * (`@daljir/automation`).
 */
export async function testRule(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const input = testAutomationRuleSchema.parse(req.body ?? {});

  const rule = await prisma.automationRule.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: {
      triggers: true,
      actions: { orderBy: { order: "asc" } },
    },
  });
  if (!rule) {
    throw notFound("Automation rule not found");
  }

  if (input.debtId) {
    const debt = await prisma.customerDebt.findFirst({
      where: { id: input.debtId, businessId: tenant.businessId },
      select: { id: true },
    });
    if (!debt) {
      throw notFound("Debt not found");
    }
  }

  const triggerResults = await Promise.all(
    rule.triggers.map(async (trigger) => {
      if (trigger.type === "LOW_STOCK") {
        const matches = await findLowStockMatches(tenant.businessId);
        return {
          triggerId: trigger.id,
          type: trigger.type,
          offsetDays: trigger.offsetDays,
          matchedCount: matches.length,
          matchedDebts: [],
          matchedStockLevels: matches.map((match) => ({
            stockLevelId: match.stockLevelId,
            productId: match.productId,
            variantId: match.variantId,
            warehouseId: match.warehouseId,
            sku: match.sku,
            quantity: match.quantity,
            threshold: match.threshold,
          })),
        };
      }

      const matches = await findMatchingDebts(tenant.businessId, trigger, input.debtId);
      return {
        triggerId: trigger.id,
        type: trigger.type,
        offsetDays: trigger.offsetDays,
        matchedCount: matches.length,
        matchedDebts: matches.map((debt) => ({
          id: debt.id,
          customerId: debt.customerId,
          dueDate: debt.dueDate,
          outstandingAmount: debt.outstandingAmount,
          status: debt.status,
        })),
        matchedStockLevels: [],
      };
    }),
  );

  const anyMatches = triggerResults.some((t) => t.matchedCount > 0);

  const wouldFireActions = anyMatches
    ? rule.actions.map((action) => ({
        actionId: action.id,
        type: action.type,
        order: action.order,
        templateId: action.templateId,
      }))
    : [];

  return sendData(res, {
    ruleId: rule.id,
    ruleName: rule.name,
    isActive: rule.isActive,
    triggers: triggerResults,
    wouldFireActions,
    note: "Dry run only — no notifications were sent and no message rows were written.",
  });
}
