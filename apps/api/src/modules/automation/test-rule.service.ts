import { testAutomationRuleSchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { findMatchingDebts } from "./trigger-evaluator.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

/**
 * Dry-run / test endpoint. Evaluates a rule's triggers against REAL debt
 * data for this tenant and reports which entities WOULD match and which
 * actions WOULD fire — it never sends anything and never writes a
 * `Notification`, `NotificationLog`, or channel-message row.
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
