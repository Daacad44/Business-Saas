import { formatMoney, renderTemplate } from "@daljir/notifications";
import type { AutomationAction, CustomerDebt, NotificationChannel, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { dispatchNotification } from "../lib/notifications.js";

export type ExecuteActionsResult = {
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

function defaultDebtMessage(debt: CustomerDebt, customerName: string) {
  return `Hello ${customerName}, your payment of ${formatMoney(debt.outstandingAmount)} is due on ${debt.dueDate
    .toISOString()
    .slice(0, 10)}.`;
}

function defaultLowStockMessage(productLabel: string, quantity: Prisma.Decimal, threshold: Prisma.Decimal) {
  return `Low stock alert: ${productLabel} has ${quantity.toString()} units left, at or below the reorder threshold of ${threshold.toString()}.`;
}

/**
 * Executes every action attached to a DEBT-triggered `AutomationExecution`'s
 * rule and dispatches the corresponding customer notifications.
 */
async function executeDebtActions(
  execution: {
    id: string;
    businessId: string;
    rule: { id: string; name: string; actions: AutomationAction[] };
    debt: CustomerDebt;
  },
  logContext: Record<string, unknown>,
): Promise<ExecuteActionsResult> {
  const { businessId, debt, rule } = execution;

  const [customer, business] = await Promise.all([
    prisma.customer.findFirst({ where: { id: debt.customerId, businessId } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }),
  ]);

  const notificationIds: string[] = [];
  let hadFailure = false;

  for (const action of rule.actions) {
    const channel = actionChannel(action.type);
    if (!channel) continue;

    const to = channel === "EMAIL" ? customer?.email : customer?.phone;
    if (!to) {
      logger.warn("Skipping action: customer has no recipient for channel", { ...logContext, channel });
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

    const content = template ? renderTemplate(template.body, variables) : defaultDebtMessage(debt, variables.customerName);
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

    logger.info("Dispatched automation notification", {
      ...logContext,
      notificationId: result.notificationId,
      status: result.status,
      channel,
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

  logger.info("Automation execution finished", { ...logContext, status: finalStatus });

  return { status: finalStatus, notificationIds };
}

/**
 * Executes every action attached to a LOW_STOCK-triggered
 * `AutomationExecution`'s rule and dispatches the corresponding
 * business-facing alerts (there is no customer for a stock alert — the
 * recipient is the business's own configured phone/email).
 */
async function executeLowStockActions(
  execution: {
    id: string;
    businessId: string;
    rule: { id: string; name: string; actions: AutomationAction[] };
    stockLevel: {
      id: string;
      quantity: Prisma.Decimal;
      reorderLevel: Prisma.Decimal | null;
      product: { name: string; sku: string; lowStockThreshold: Prisma.Decimal | null };
      variant: { name: string } | null;
    };
  },
  logContext: Record<string, unknown>,
): Promise<ExecuteActionsResult> {
  const { businessId, stockLevel, rule } = execution;
  const threshold = stockLevel.reorderLevel ?? stockLevel.product.lowStockThreshold;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, email: true, phone: true },
  });

  const productLabel = stockLevel.variant ? `${stockLevel.product.name} (${stockLevel.variant.name})` : stockLevel.product.name;

  const notificationIds: string[] = [];
  let hadFailure = false;

  for (const action of rule.actions) {
    const channel = actionChannel(action.type);
    if (!channel) continue;

    const to = channel === "EMAIL" ? business?.email : business?.phone;
    if (!to) {
      logger.warn("Skipping action: business has no recipient for channel", { ...logContext, channel });
      hadFailure = true;
      continue;
    }

    const template = action.templateId
      ? await prisma.notificationTemplate.findFirst({ where: { id: action.templateId, businessId } })
      : null;

    const variables = {
      productName: stockLevel.product.name,
      variantName: stockLevel.variant?.name ?? "",
      sku: stockLevel.product.sku,
      quantity: stockLevel.quantity.toString(),
      threshold: threshold?.toString() ?? "",
      businessName: business?.name ?? "",
    };

    const content = template
      ? renderTemplate(template.body, variables)
      : defaultLowStockMessage(productLabel, stockLevel.quantity, threshold ?? stockLevel.quantity);
    const subject = template?.subject ? renderTemplate(template.subject, variables) : null;

    const result = await dispatchNotification({
      businessId,
      channel,
      to,
      subject,
      content,
      templateId: template?.id ?? null,
      executionId: execution.id,
      title: `automation:${rule.name}`,
    });

    logger.info("Dispatched automation notification", {
      ...logContext,
      notificationId: result.notificationId,
      status: result.status,
      channel,
    });

    notificationIds.push(result.notificationId);
    if (result.status === "FAILED") {
      hadFailure = true;
    }
  }

  const finalStatus: "SUCCESS" | "FAILED" = hadFailure ? "FAILED" : "SUCCESS";

  await prisma.automationExecution.update({
    where: { id: execution.id },
    data: { status: finalStatus, executedAt: new Date() },
  });

  logger.info("Automation execution finished", { ...logContext, status: finalStatus });

  return { status: finalStatus, notificationIds };
}

/**
 * Executes every action attached to an `AutomationExecution`'s rule and
 * dispatches the corresponding notifications. Called by the
 * notification-dispatch queue worker.
 *
 * Idempotency guard: atomically claims the execution by flipping
 * PENDING -> RUNNING. If another worker (or a duplicate BullMQ delivery)
 * already claimed it, this is a no-op — it will never send twice for the
 * same execution (CLAUDE.md rule 8).
 *
 * Dispatches to either the DEBT-triggered flow or the LOW_STOCK-triggered
 * flow depending on which relation the execution carries.
 */
export async function executeActions(executionId: string): Promise<ExecuteActionsResult> {
  const claim = await prisma.automationExecution.updateMany({
    where: { id: executionId, status: "PENDING" },
    data: { status: "RUNNING" },
  });
  if (claim.count === 0) {
    const existing = await prisma.automationExecution.findUnique({ where: { id: executionId } });
    logger.info("Execution already claimed/processed — no-op", {
      executionId,
      status: existing?.status,
    });
    return { status: existing?.status === "SUCCESS" ? "SUCCESS" : existing?.status === "FAILED" ? "FAILED" : "SKIPPED", notificationIds: [] };
  }

  const execution = await prisma.automationExecution.findUnique({
    where: { id: executionId },
    include: {
      rule: { include: { actions: { orderBy: { order: "asc" } } } },
      debt: true,
      stockLevel: { include: { product: true, variant: true } },
    },
  });

  if (!execution || (!execution.debt && !execution.stockLevel)) {
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: "SKIPPED", error: "Missing debt/stock line or rule at execution time", executedAt: new Date() },
    });
    return { status: "SKIPPED", notificationIds: [] };
  }

  const { businessId, rule } = execution;
  const logContext = { businessId, ruleId: rule.id, executionId };

  if (execution.debt) {
    return executeDebtActions(
      { id: execution.id, businessId, rule, debt: execution.debt },
      { ...logContext, debtId: execution.debt.id },
    );
  }

  return executeLowStockActions(
    { id: execution.id, businessId, rule, stockLevel: execution.stockLevel! },
    { ...logContext, stockLevelId: execution.stockLevel!.id },
  );
}
