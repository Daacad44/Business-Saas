import { createBatchSchema } from "@daljir/validation";
import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { paginationParams, serializeBatch } from "./mappers.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

export async function listBatches(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const { page, pageSize, skip, take } = paginationParams(req.query);

  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
  const expiringBefore =
    typeof req.query.expiringBefore === "string" ? new Date(req.query.expiringBefore) : undefined;

  const where: Prisma.BatchWhereInput = {
    businessId: tenant.businessId,
    ...(warehouseId ? { warehouseId } : {}),
    ...(productId ? { productId } : {}),
    ...(expiringBefore && !Number.isNaN(expiringBefore.getTime())
      ? { expiryDate: { lte: expiringBefore, not: null } }
      : {}),
  };

  const [total, batches] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({
      where,
      orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
  ]);

  return sendData(res, batches.map(serializeBatch), 200, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function getBatch(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const batch = await prisma.batch.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!batch) {
    throw notFound("Batch not found");
  }
  return sendData(res, serializeBatch(batch));
}

export async function createBatch(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createBatchSchema.parse(req.body);

  const [warehouse, product, variant] = await Promise.all([
    prisma.warehouse.findFirst({ where: { id: input.warehouseId, businessId: tenant.businessId } }),
    prisma.product.findFirst({ where: { id: input.productId, businessId: tenant.businessId } }),
    input.variantId
      ? prisma.productVariant.findFirst({
          where: { id: input.variantId, businessId: tenant.businessId, productId: input.productId },
        })
      : null,
  ]);
  if (!warehouse) {
    throw notFound("Warehouse not found");
  }
  if (!product) {
    throw notFound("Product not found");
  }
  if (input.variantId && !variant) {
    throw notFound("Variant not found");
  }

  const exists = await prisma.batch.findFirst({
    where: {
      businessId: tenant.businessId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      batchNumber: input.batchNumber,
    },
  });
  if (exists) {
    throw conflict("A batch with this number already exists for this product and warehouse");
  }

  const batch = await prisma.batch.create({
    data: {
      businessId: tenant.businessId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      batchNumber: input.batchNumber,
      expiryDate: input.expiryDate ?? null,
      quantity: input.quantity,
      costPrice: input.costPrice ?? null,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "batch.create",
    entityType: "Batch",
    entityId: batch.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, serializeBatch(batch), 201);
}
