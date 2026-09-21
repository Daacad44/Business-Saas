import type { Prisma } from "@prisma/client";
import { createAutomationRuleSchema, updateAutomationRuleSchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { buildPageMeta, parsePagination } from "./pagination.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

const RULE_INCLUDE = {
  triggers: true,
  actions: { orderBy: { order: "asc" as const } },
};

/**
 * Validates that any templateId referenced by an action belongs to this
 * tenant and matches the action's implied channel where applicable.
 */
async function assertActionTemplatesBelongToTenant(
  businessId: string,
  actions: Array<{ templateId?: string; type: string }>,
) {
  const templateIds = actions.map((a) => a.templateId).filter((id): id is string => Boolean(id));
  if (templateIds.length === 0) return;
  const templates = await prisma.notificationTemplate.findMany({
    where: { id: { in: templateIds }, businessId },
    select: { id: true },
  });
  const found = new Set(templates.map((t) => t.id));
  const missing = templateIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw notFound("One or more notification templates were not found");
  }
}

export async function listRules(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const isActiveParam = req.query.isActive as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  const where = {
    businessId: tenant.businessId,
    ...(isActiveParam !== undefined ? { isActive: isActiveParam === "true" } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [rules, total] = await Promise.all([
    prisma.automationRule.findMany({
      where,
      include: RULE_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.automationRule.count({ where }),
  ]);

  return sendData(res, rules, 200, buildPageMeta(total, pagination));
}

export async function getRule(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const rule = await prisma.automationRule.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: RULE_INCLUDE,
  });
  if (!rule) {
    throw notFound("Automation rule not found");
  }
  return sendData(res, rule);
}

export async function createRule(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createAutomationRuleSchema.parse(req.body);

  const exists = await prisma.automationRule.findUnique({
    where: { businessId_name: { businessId: tenant.businessId, name: input.name } },
  });
  if (exists) {
    throw conflict("An automation rule with this name already exists");
  }

  await assertActionTemplatesBelongToTenant(tenant.businessId, input.actions);

  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.automationRule.create({
      data: {
        businessId: tenant.businessId,
        name: input.name,
        description: input.description,
        isActive: input.isActive,
      },
    });

    await tx.automationTrigger.createMany({
      data: input.triggers.map((trigger) => ({
        businessId: tenant.businessId,
        ruleId: created.id,
        type: trigger.type,
        offsetDays: trigger.offsetDays,
        config: trigger.config as Prisma.InputJsonValue,
      })),
    });

    await tx.automationAction.createMany({
      data: input.actions.map((action) => ({
        businessId: tenant.businessId,
        ruleId: created.id,
        type: action.type,
        order: action.order,
        templateId: action.templateId,
        config: action.config as Prisma.InputJsonValue,
      })),
    });

    return tx.automationRule.findUniqueOrThrow({
      where: { id: created.id },
      include: RULE_INCLUDE,
    });
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "automation_rule.create",
    entityType: "AutomationRule",
    entityId: rule.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, rule, 201);
}

export async function updateRule(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateAutomationRuleSchema.parse(req.body);
  const rule = await prisma.automationRule.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!rule) {
    throw notFound("Automation rule not found");
  }

  if (input.name && input.name !== rule.name) {
    const exists = await prisma.automationRule.findUnique({
      where: { businessId_name: { businessId: tenant.businessId, name: input.name } },
    });
    if (exists) {
      throw conflict("An automation rule with this name already exists");
    }
  }

  if (input.actions) {
    await assertActionTemplatesBelongToTenant(tenant.businessId, input.actions);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.triggers) {
      await tx.automationTrigger.deleteMany({ where: { ruleId: rule.id } });
      await tx.automationTrigger.createMany({
        data: input.triggers.map((trigger) => ({
          businessId: tenant.businessId,
          ruleId: rule.id,
          type: trigger.type,
          offsetDays: trigger.offsetDays,
          config: trigger.config as Prisma.InputJsonValue,
        })),
      });
    }

    if (input.actions) {
      await tx.automationAction.deleteMany({ where: { ruleId: rule.id } });
      await tx.automationAction.createMany({
        data: input.actions.map((action) => ({
          businessId: tenant.businessId,
          ruleId: rule.id,
          type: action.type,
          order: action.order,
          templateId: action.templateId,
          config: action.config as Prisma.InputJsonValue,
        })),
      });
    }

    await tx.automationRule.update({
      where: { id: rule.id },
      data: {
        name: input.name,
        description: input.description,
        isActive: input.isActive,
      },
    });

    return tx.automationRule.findUniqueOrThrow({
      where: { id: rule.id },
      include: RULE_INCLUDE,
    });
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "automation_rule.update",
    entityType: "AutomationRule",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, updated);
}

export async function deleteRule(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const rule = await prisma.automationRule.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!rule) {
    throw notFound("Automation rule not found");
  }

  await prisma.automationRule.delete({ where: { id: rule.id } });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "automation_rule.delete",
    entityType: "AutomationRule",
    entityId: rule.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, { id: rule.id });
}

async function setActive(req: Request, res: Response, isActive: boolean) {
  const { tenant, auth } = assertTenant(req);
  const rule = await prisma.automationRule.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!rule) {
    throw notFound("Automation rule not found");
  }

  const updated = await prisma.automationRule.update({
    where: { id: rule.id },
    data: { isActive },
    include: RULE_INCLUDE,
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: isActive ? "automation_rule.activate" : "automation_rule.deactivate",
    entityType: "AutomationRule",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, updated);
}

export async function activateRule(req: Request, res: Response) {
  return setActive(req, res, true);
}

export async function deactivateRule(req: Request, res: Response) {
  return setActive(req, res, false);
}
