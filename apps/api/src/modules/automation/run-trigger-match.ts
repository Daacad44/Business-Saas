import type { AutomationAction, AutomationRule, AutomationTrigger, CustomerDebt, NotificationChannel } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { dispatchNotification } from "../notifications/dispatch.service.js";
import { formatMoney, renderTemplate } from "../notifications/render.js";
import { buildAutomationIdempotencyKey } from "./idempotency.js";

export type RuleWithActions = AutomationRule & { actions: AutomationAction[] };

export type ProcessTriggerMatchResult = {
  /** false when this exact (rule, debt, trigger, dueDate) tuple was already processed — a safe no-op. */
  created: boolean;
  executionId: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  notificationIds: string[];
};

function actionChannel(type: AutomationAction["type"]): NotificationChannel | null {
  switch (type) {
    case "SEND_WHATSAPP":
      return "WHATSAPP";
    case "SEND_SMS":
      return "SMS";
    case "SEND_EMAIL":
      return "EMAIL";
    case "CREATE_NOTIFICATION":
      return "IN_APP";
    case "WEBHOOK":
    default:
      return null;
  }
}

function defaultMessage(debt: CustomerDebt, customerName: string) {
  return `Hello ${customerName}, your payment of ${formatMoney(debt.outstandingAmount)} is due on ${debt.dueDate
    .toISOString()
    .slice(0, 10)}.`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "P2002",
  );
}

/**
 * Processes ONE (rule, trigger, debt) match end-to-end:
 * 1. Attempts to create the `AutomationExecution` using a deterministic
 *    `idempotencyKey`. A unique-constraint violation means this exact
 *    tuple was already processed — it is handled as a safe no-op, not an
 *    error (CLAUDE.md rule 8).
 * 2. Only when a NEW execution row was created does it render templates
 *    and dispatch notifications through `dispatchNotification`, which
 *    itself guarantees every send is logged (CLAUDE.md rule 9).
 *
 * This function is the canonical "automation job" unit run by the debt
 * due-date scheduler. It is duplicated (structurally identical) in
 * `apps/worker` because the worker is a separate deployable package that
 * cannot import API application source across the workspace boundary.
 */
export async function processTriggerMatch(params: {
  businessId: string;
  rule: RuleWithActions;
  trigger: Pick<AutomationTrigger, "id" | "type" | "offsetDays">;
  debt: CustomerDebt;
}): Promise<ProcessTriggerMatchResult> {
  const { businessId, rule, trigger, debt } = params;
  const idempotencyKey = buildAutomationIdempotencyKey(rule.id, debt, trigger);

  let execution;
  try {
    execution = await prisma.automationExecution.create({
      data: {
        businessId,
        ruleId: rule.id,
        triggerId: trigger.id,
        debtId: debt.id,
        status: "RUNNING",
        idempotencyKey,
        attempt: 1,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.automationExecution.findUnique({ where: { idempotencyKey } });
      return {
        created: false,
        executionId: existing?.id ?? "",
        status: existing?.status === "SUCCESS" ? "SUCCESS" : "SKIPPED",
        notificationIds: [],
      };
    }
    throw error;
  }

  const [customer, business] = await Promise.all([
    prisma.customer.findFirst({ where: { id: debt.customerId, businessId } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }),
  ]);

  const notificationIds: string[] = [];
  let hadFailure = false;

  for (const action of rule.actions) {
    const channel = actionChannel(action.type);
    if (!channel) {
      // WEBHOOK / unsupported action types are not customer notifications
      // and are intentionally out of scope for the notification pipeline.
      continue;
    }

    const to = channel === "EMAIL" ? customer?.email : customer?.phone;
    if (!to) {
      hadFailure = true;
      continue;
    }

    const template = action.templateId
      ? await prisma.notificationTemplate.findFirst({ where: { id: action.templateId, businessId } })
      : null;

    const variables = {
      customerName: customer?.fullName ?? "Customer",
      amountDue: debt.outstandingAmount,
      dueDate: debt.dueDate,
      businessName: business?.name ?? "",
    };

    const content = template ? renderTemplate(template.body, variables) : defaultMessage(debt, variables.customerName);
    const subject = template?.subject ? renderTemplate(template.subject, variables) : null;

    const result = await dispatchNotification({
      businessId,
      channel,
      to,
      subject,
      content,
      customerId: customer?.id ?? null,
      templateId: template?.id ?? null,
      executionId: execution.id,
      title: `automation:${rule.name}`,
    });

    notificationIds.push(result.notificationId);
    if (result.status === "FAILED") {
      hadFailure = true;
    }
  }

  const finalStatus: "SUCCESS" | "FAILED" = hadFailure ? "FAILED" : "SUCCESS";

  await prisma.$transaction([
    prisma.automationExecution.update({
      where: { id: execution.id },
      data: { status: finalStatus, executedAt: new Date() },
    }),
    prisma.customerDebt.update({
      where: { id: debt.id },
      data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() },
    }),
  ]);

  return { created: true, executionId: execution.id, status: finalStatus, notificationIds };
}
