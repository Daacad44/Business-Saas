import { createProductVariantSchema, updateProductVariantSchema } from "@daljir/validation";
import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { serializeVariant } from "./mappers.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

async function findProductOr404(businessId: string, productId: string | undefined) {
  if (!productId) {
    throw notFound("Product not found");
  }
  const product = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!product) {
    throw notFound("Product not found");
  }
  return product;
}

export async function listVariants(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  await findProductOr404(tenant.businessId, req.params.productId);
  const variants = await prisma.productVariant.findMany({
    where: { businessId: tenant.businessId, productId: req.params.productId },
    orderBy: { name: "asc" },
  });
  return sendData(res, variants.map(serializeVariant));
}

export async function getVariant(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  await findProductOr404(tenant.businessId, req.params.productId);
  const variant = await prisma.productVariant.findFirst({
    where: { id: req.params.id, productId: req.params.productId, businessId: tenant.businessId },
  });
  if (!variant) {
    throw notFound("Variant not found");
  }
  return sendData(res, serializeVariant(variant));
}

export async function createVariant(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const product = await findProductOr404(tenant.businessId, req.params.productId);
  const input = createProductVariantSchema.parse({ ...req.body, productId: product.id });
  if (input.productId !== product.id) {
    throw badRequest("productId in body must match the URL");
  }

  const [skuExists, barcodeExists] = await Promise.all([
    prisma.productVariant.findUnique({
      where: { businessId_sku: { businessId: tenant.businessId, sku: input.sku } },
    }),
    input.barcode
      ? prisma.productVariant.findUnique({
          where: { businessId_barcode: { businessId: tenant.businessId, barcode: input.barcode } },
        })
      : null,
  ]);
  if (skuExists) {
    throw conflict("A variant with this SKU already exists");
  }
  if (barcodeExists) {
    throw conflict("A variant with this barcode already exists");
  }

  const variant = await prisma.$transaction(async (tx) => {
    const created = await tx.productVariant.create({
      data: {
        businessId: tenant.businessId,
        productId: product.id,
        name: input.name,
        sku: input.sku,
        barcode: input.barcode ?? null,
        costPrice: input.costPrice,
        sellingPrice: input.sellingPrice,
        attributes: input.attributes as Prisma.InputJsonValue,
      },
    });
    if (!product.hasVariants) {
      await tx.product.update({ where: { id: product.id }, data: { hasVariants: true } });
    }
    return created;
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "product-variant.create",
    entityType: "ProductVariant",
    entityId: variant.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, serializeVariant(variant), 201);
}

export async function updateVariant(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  await findProductOr404(tenant.businessId, req.params.productId);
  const input = updateProductVariantSchema.parse(req.body);
  const variant = await prisma.productVariant.findFirst({
    where: { id: req.params.id, productId: req.params.productId, businessId: tenant.businessId },
  });
  if (!variant) {
    throw notFound("Variant not found");
  }

  if (input.sku && input.sku !== variant.sku) {
    const exists = await prisma.productVariant.findUnique({
      where: { businessId_sku: { businessId: tenant.businessId, sku: input.sku } },
    });
    if (exists) {
      throw conflict("A variant with this SKU already exists");
    }
  }
  if (input.barcode && input.barcode !== variant.barcode) {
    const exists = await prisma.productVariant.findUnique({
      where: { businessId_barcode: { businessId: tenant.businessId, barcode: input.barcode } },
    });
    if (exists) {
      throw conflict("A variant with this barcode already exists");
    }
  }

  const updated = await prisma.productVariant.update({
    where: { id: variant.id },
    data: {
      name: input.name,
      sku: input.sku,
      barcode: input.barcode === undefined ? undefined : input.barcode,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      attributes: input.attributes as Prisma.InputJsonValue | undefined,
      status: input.status,
    },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "product-variant.update",
    entityType: "ProductVariant",
    entityId: updated.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, serializeVariant(updated));
}

export async function deleteVariant(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  await findProductOr404(tenant.businessId, req.params.productId);
  const variant = await prisma.productVariant.findFirst({
    where: { id: req.params.id, productId: req.params.productId, businessId: tenant.businessId },
  });
  if (!variant) {
    throw notFound("Variant not found");
  }

  const archived = await prisma.productVariant.update({
    where: { id: variant.id },
    data: { status: "ARCHIVED" },
  });

  await writeAudit({
    businessId: tenant.businessId,
    userId: auth.userId,
    action: "product-variant.archive",
    entityType: "ProductVariant",
    entityId: variant.id,
    ipAddress: clientIp(req.ip),
  });
  return sendData(res, serializeVariant(archived));
}
