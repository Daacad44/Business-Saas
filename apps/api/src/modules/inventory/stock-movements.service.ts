import type { Prisma, StockMovementType } from "@prisma/client";
import type { Request, Response } from "express";
import { forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { paginationParams, serializeMovement } from "./mappers.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

const VALID_TYPES = new Set<string>([
  "PURCHASE_IN",
  "SALE_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RETURN_IN",
  "RETURN_OUT",
  "OPENING_BALANCE",
]);

/**
 * Read-only stock ledger query. There is intentionally NO write endpoint
 * here — every StockMovement is created exclusively by `applyStockMovement`
 * as part of an adjustment, transfer, sale, or purchase transaction.
 */
export async function listMovements(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const { page, pageSize, skip, take } = paginationParams(req.query);

  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
  const variantId = typeof req.query.variantId === "string" ? req.query.variantId : undefined;
  const typeRaw = typeof req.query.type === "string" ? req.query.type : undefined;
  const type = typeRaw && VALID_TYPES.has(typeRaw) ? (typeRaw as StockMovementType) : undefined;
  const referenceType = typeof req.query.referenceType === "string" ? req.query.referenceType : undefined;
  const referenceId = typeof req.query.referenceId === "string" ? req.query.referenceId : undefined;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

  const where: Prisma.StockMovementWhereInput = {
    businessId: tenant.businessId,
    ...(warehouseId ? { warehouseId } : {}),
    ...(productId ? { productId } : {}),
    ...(variantId ? { variantId } : {}),
    ...(type ? { type } : {}),
    ...(referenceType ? { referenceType } : {}),
    ...(referenceId ? { referenceId } : {}),
    ...((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))
      ? {
          createdAt: {
            ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
            ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [total, movements] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);

  return sendData(res, movements.map(serializeMovement), 200, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function getMovement(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const movement = await prisma.stockMovement.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
  });
  if (!movement) {
    throw notFound("Stock movement not found");
  }
  return sendData(res, serializeMovement(movement));
}
