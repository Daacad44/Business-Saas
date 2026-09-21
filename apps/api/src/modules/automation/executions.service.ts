import type { AutomationExecutionStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { buildPageMeta, parsePagination } from "./pagination.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

const VALID_STATUSES: AutomationExecutionStatus[] = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "SKIPPED"];

export async function listExecutions(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const ruleId = req.query.ruleId as string | undefined;
  const status = req.query.status as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const where = {
    businessId: tenant.businessId,
    ...(ruleId ? { ruleId } : {}),
    ...(status && VALID_STATUSES.includes(status as AutomationExecutionStatus)
      ? { status: status as AutomationExecutionStatus }
      : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [executions, total] = await Promise.all([
    prisma.automationExecution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        rule: { select: { id: true, name: true } },
        debt: { select: { id: true, dueDate: true, outstandingAmount: true } },
        notifications: { select: { id: true, channel: true, status: true } },
      },
    }),
    prisma.automationExecution.count({ where }),
  ]);

  return sendData(res, executions, 200, buildPageMeta(total, pagination));
}

export async function getExecution(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const execution = await prisma.automationExecution.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: {
      rule: true,
      trigger: true,
      debt: true,
      notifications: { include: { logs: true } },
    },
  });
  if (!execution) {
    throw notFound("Automation execution not found");
  }
  return sendData(res, execution);
}
