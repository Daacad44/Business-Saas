import { createProductSchema, updateProductSchema } from "@daljir/validation";
import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { paginationParams, serializeProduct } from "./mappers.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

const SORTABLE_FIELDS = new Set(["name", "sku", "createdAt", "sellingPrice", "costPrice"]);

export async function listProducts(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const { page, pageSize, skip, take } = paginationParams(req.query);

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const sortByRaw = typeof req.query.sortBy === "string" ? req.query.sortBy : "createdAt";
  const sortBy = SORTABLE_FIELDS.has(sortByRaw) ? sortByRaw : "createdAt";
  const sortDir = req.query.sortDir === "asc" ? "asc" : "desc";

  const where: Prisma.ProductWhereInput = {
    businessId: tenant.businessId,
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status: status as "ACTIVE" | "ARCHIVED" } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip,
      take,
    }),
  ]);

  return sendData(res, products.map(serializeProduct), 200, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function getProduct(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!product) {
    throw notFound("Product not found");
  }
  return sendData(res, serializeProduct(product));
}

export async function createProduct(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createProductSchema.parse(req.body);

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, businessId: tenant.businessId },
    });
    if (!category) {
      throw notFound("Category not found");
    }
  }
  if (input.unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, businessId: tenant.businessId },
    });
    if (!unit) {
      throw notFound("Unit not found");
    }
  }

  const [skuExists, barcodeExists] = await Promise.all([
    prisma.product.findUnique({
      where: { businessId_sku: { businessId: tenant.businessId, sku: input.sku } },
    }),
    input.barcode
      ? prisma.product.findUnique({
          where: { businessId_barcode: { businessId: tenant.businessId, barcode: input.barcode } },
        })
      : null,
  ]);
  if (skuExists) {
    throw conflict("A product with this SKU already exists");
  }
  if (barcodeExists) {
    throw conflict("A product with this barcode already exists");
  }

  const product = await prisma.product.create({
    data: {
      businessId: tenant.businessId,
      categoryId: input.categoryId ?? null,
      unitId: input.unitId ?? null,
      name: input.name,
      sku: input.sku,
      barcode: input.barcode ?? null,
      description: input.description ?? null,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      taxRate: input.taxRate,
      trackStock: input.trackStock,
      hasVariants: input.hasVariants,
      lowStockThreshold: input.lowStockThreshold ?? null,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "product.create",
    entityType: "Product",
    entityId: product.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, serializeProduct(product), 201);
}

export async function updateProduct(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = updateProductSchema.parse(req.body);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!product) {
    throw notFound("Product not found");
  }

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, businessId: tenant.businessId },
    });
    if (!category) {
      throw notFound("Category not found");
    }
  }
  if (input.unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, businessId: tenant.businessId },
    });
    if (!unit) {
      throw notFound("Unit not found");
    }
  }
  if (input.sku && input.sku !== product.sku) {
    const exists = await prisma.product.findUnique({
      where: { businessId_sku: { businessId: tenant.businessId, sku: input.sku } },
    });
    if (exists) {
      throw conflict("A product with this SKU already exists");
    }
  }
  if (input.barcode && input.barcode !== product.barcode) {
    const exists = await prisma.product.findUnique({
      where: { businessId_barcode: { businessId: tenant.businessId, barcode: input.barcode } },
    });
    if (exists) {
      throw conflict("A product with this barcode already exists");
    }
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      categoryId: input.categoryId === undefined ? undefined : input.categoryId,
      unitId: input.unitId === undefined ? undefined : input.unitId,
      name: input.name,
      sku: input.sku,
      barcode: input.barcode === undefined ? undefined : input.barcode,
      description: input.description === undefined ? undefined : input.description,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      taxRate: input.taxRate,
      trackStock: input.trackStock,
      hasVariants: input.hasVariants,
      lowStockThreshold: input.lowStockThreshold === undefined ? undefined : input.lowStockThreshold,
      status: input.status,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "product.update",
    entityType: "Product",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, serializeProduct(updated));
}

export async function deleteProduct(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!product) {
    throw notFound("Product not found");
  }

  const archived = await prisma.product.update({
    where: { id: product.id },
    data: { status: "ARCHIVED" },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "product.archive",
    entityType: "Product",
    entityId: product.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, serializeProduct(archived));
}
