import { createCategorySchema, updateCategorySchema } from "@daljir/validation";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

/**
 * Walks the parent chain of `candidateParentId` and throws if `categoryId`
 * appears anywhere in it (i.e. the category would become its own ancestor).
 */
async function assertNoCycle(businessId: string, categoryId: string, candidateParentId: string) {
  if (candidateParentId === categoryId) {
    throw badRequest("A category cannot be its own parent");
  }
  let currentId: string | null = candidateParentId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === categoryId) {
      throw badRequest("This would create a category cycle");
    }
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    const current: { parentId: string | null } | null = await prisma.category.findFirst({
      where: { id: currentId, businessId },
      select: { parentId: true },
    });
    currentId = current?.parentId ?? null;
  }
}

export async function listCategories(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const categories = await prisma.category.findMany({
    where: { businessId: tenant.businessId },
    orderBy: { name: "asc" },
  });
  return sendData(res, categories);
}

export async function getCategory(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const category = await prisma.category.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!category) {
    throw notFound("Category not found");
  }
  return sendData(res, category);
}

export async function createCategory(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createCategorySchema.parse(req.body);

  if (input.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: input.parentId, businessId: tenant.businessId },
    });
    if (!parent) {
      throw notFound("Parent category not found");
    }
  }

  const exists = await prisma.category.findUnique({
    where: { businessId_name: { businessId: tenant.businessId, name: input.name } },
  });
  if (exists) {
    throw conflict("A category with this name already exists");
  }

  const category = await prisma.category.create({
    data: {
      businessId: tenant.businessId,
      name: input.name,
      parentId: input.parentId ?? null,
      description: input.description,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "category.create",
    entityType: "Category",
    entityId: category.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, category, 201);
}

export async function updateCategory(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateCategorySchema.parse(req.body);
  const category = await prisma.category.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!category) {
    throw notFound("Category not found");
  }

  if (input.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: input.parentId, businessId: tenant.businessId },
    });
    if (!parent) {
      throw notFound("Parent category not found");
    }
    await assertNoCycle(tenant.businessId, category.id, input.parentId);
  }

  if (input.name && input.name !== category.name) {
    const exists = await prisma.category.findUnique({
      where: { businessId_name: { businessId: tenant.businessId, name: input.name } },
    });
    if (exists) {
      throw conflict("A category with this name already exists");
    }
  }

  const updated = await prisma.category.update({
    where: { id: category.id },
    data: {
      name: input.name,
      parentId: input.parentId === undefined ? undefined : input.parentId,
      description: input.description === undefined ? undefined : input.description,
      status: input.status,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "category.update",
    entityType: "Category",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, updated);
}

export async function deleteCategory(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const category = await prisma.category.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!category) {
    throw notFound("Category not found");
  }

  const [childCount, productCount] = await Promise.all([
    prisma.category.count({ where: { businessId: tenant.businessId, parentId: category.id } }),
    prisma.product.count({ where: { businessId: tenant.businessId, categoryId: category.id } }),
  ]);
  if (childCount > 0 || productCount > 0) {
    throw conflict("This category has child categories or products and cannot be deleted");
  }

  await prisma.category.delete({ where: { id: category.id } });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "category.delete",
    entityType: "Category",
    entityId: category.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, { ok: true });
}
