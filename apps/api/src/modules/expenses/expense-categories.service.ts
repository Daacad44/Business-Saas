import { createExpenseCategorySchema, updateExpenseCategorySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

async function findCategoryOr404(businessId: string, categoryId: string) {
  const category = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, businessId },
  });
  if (!category) {
    throw notFound("Expense category not found");
  }
  return category;
}

export async function listExpenseCategories(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const categories = await prisma.expenseCategory.findMany({
    where: { businessId: tenant.businessId },
    orderBy: { name: "asc" },
  });
  return sendData(res, categories);
}

export async function createExpenseCategory(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createExpenseCategorySchema.parse(req.body);

  const existing = await prisma.expenseCategory.findUnique({
    where: { businessId_name: { businessId: tenant.businessId, name: input.name } },
  });
  if (existing) {
    throw conflict("An expense category with this name already exists");
  }

  const category = await prisma.expenseCategory.create({
    data: {
      businessId: tenant.businessId,
      name: input.name,
      description: input.description,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "expense_category.create",
    entityType: "ExpenseCategory",
    entityId: category.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, category, 201);
}

export async function getExpenseCategory(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const category = await findCategoryOr404(tenant.businessId, req.params.id as string);
  return sendData(res, category);
}

export async function updateExpenseCategory(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateExpenseCategorySchema.parse(req.body);
  const category = await findCategoryOr404(tenant.businessId, req.params.id as string);

  if (input.name && input.name !== category.name) {
    const existing = await prisma.expenseCategory.findUnique({
      where: { businessId_name: { businessId: tenant.businessId, name: input.name } },
    });
    if (existing && existing.id !== category.id) {
      throw conflict("An expense category with this name already exists");
    }
  }

  const updated = await prisma.expenseCategory.update({
    where: { id: category.id },
    data: { name: input.name, description: input.description },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "expense_category.update",
    entityType: "ExpenseCategory",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, updated);
}

export async function deleteExpenseCategory(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const category = await findCategoryOr404(tenant.businessId, req.params.id as string);

  const expenseCount = await prisma.expense.count({
    where: { businessId: tenant.businessId, categoryId: category.id },
  });
  if (expenseCount > 0) {
    throw conflict("Cannot delete an expense category that has expenses recorded against it");
  }

  await prisma.expenseCategory.delete({ where: { id: category.id } });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "expense_category.delete",
    entityType: "ExpenseCategory",
    entityId: category.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, { ok: true });
}
