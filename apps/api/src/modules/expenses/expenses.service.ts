import { createExpenseSchema, updateExpenseSchema } from "@daljir/validation";
import { Prisma, type PaymentMethod } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { parsePagination, paginationMeta } from "./pagination.js";
import { money, serializeExpense } from "./serialize.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

async function findExpenseOr404(businessId: string, expenseId: string) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, businessId },
  });
  if (!expense) {
    throw notFound("Expense not found");
  }
  return expense;
}

async function assertCategoryInBusiness(businessId: string, categoryId: string) {
  const category = await prisma.expenseCategory.findFirst({ where: { id: categoryId, businessId } });
  if (!category) {
    throw notFound("Expense category not found");
  }
  return category;
}

async function assertBranchInBusiness(businessId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) {
    throw notFound("Branch not found");
  }
  return branch;
}

export async function listExpenses(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const pagination = parsePagination(req);
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const method = typeof req.query.method === "string" ? (req.query.method as PaymentMethod) : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;

  const where: Prisma.ExpenseWhereInput = {
    businessId: tenant.businessId,
    ...(categoryId ? { categoryId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(method ? { method } : {}),
    ...(dateFrom || dateTo
      ? {
          expenseDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { expenseDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.expense.count({ where }),
  ]);

  return sendData(res, expenses.map(serializeExpense), 200, paginationMeta(pagination, total));
}

export async function createExpense(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createExpenseSchema.parse(req.body);

  await assertCategoryInBusiness(tenant.businessId, input.categoryId);
  if (input.branchId) {
    await assertBranchInBusiness(tenant.businessId, input.branchId);
  }

  const expense = await prisma.expense.create({
    data: {
      businessId: tenant.businessId,
      categoryId: input.categoryId,
      branchId: input.branchId,
      amount: new Prisma.Decimal(input.amount),
      description: input.description,
      method: input.method,
      reference: input.reference,
      paidById: auth.userId,
      expenseDate: input.expenseDate ?? new Date(),
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "expense.create",
    entityType: "Expense",
    entityId: expense.id,
    metadata: { amount: money(expense.amount) },
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeExpense(expense), 201);
}

export async function getExpense(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const expense = await findExpenseOr404(tenant.businessId, req.params.id as string);
  return sendData(res, serializeExpense(expense));
}

export async function updateExpense(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateExpenseSchema.parse(req.body);
  const expense = await findExpenseOr404(tenant.businessId, req.params.id as string);

  if (input.categoryId) {
    await assertCategoryInBusiness(tenant.businessId, input.categoryId);
  }
  if (input.branchId) {
    await assertBranchInBusiness(tenant.businessId, input.branchId);
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      categoryId: input.categoryId,
      branchId: input.branchId,
      amount: input.amount !== undefined ? new Prisma.Decimal(input.amount) : undefined,
      description: input.description,
      method: input.method,
      reference: input.reference,
      expenseDate: input.expenseDate,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "expense.update",
    entityType: "Expense",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, serializeExpense(updated));
}

export async function deleteExpense(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const expense = await findExpenseOr404(tenant.businessId, req.params.id as string);

  await prisma.expense.delete({ where: { id: expense.id } });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "expense.delete",
    entityType: "Expense",
    entityId: expense.id,
    ipAddress: clientIp(req.ip),
  });

  return sendData(res, { ok: true });
}

export async function getExpenseTotalsByCategory(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;

  const where: Prisma.ExpenseWhereInput = {
    businessId: tenant.businessId,
    ...(branchId ? { branchId } : {}),
    ...(dateFrom || dateTo
      ? {
          expenseDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const groups = await prisma.expense.groupBy({
    by: ["categoryId"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });

  const categories = await prisma.expenseCategory.findMany({
    where: { businessId: tenant.businessId, id: { in: groups.map((group) => group.categoryId) } },
    select: { id: true, name: true },
  });
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

  const totalAmount = groups.reduce(
    (sum, group) => sum.plus(new Prisma.Decimal(group._sum.amount ?? 0)),
    new Prisma.Decimal(0),
  );

  return sendData(res, {
    categories: groups.map((group) => ({
      categoryId: group.categoryId,
      categoryName: categoryNameById.get(group.categoryId) ?? "Unknown",
      count: group._count._all,
      totalAmount: money(group._sum.amount ?? new Prisma.Decimal(0)),
    })),
    totalAmount: money(totalAmount),
  });
}
