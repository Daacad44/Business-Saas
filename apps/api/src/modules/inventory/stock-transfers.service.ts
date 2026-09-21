import { createStockTransferSchema, receiveStockTransferSchema } from "@daljir/validation";
import type { Prisma, StockTransferStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { writeAudit } from "../../lib/audit.js";
import { clientIp } from "../../lib/business-setup.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendData } from "../../lib/response.js";
import { paginationParams, serializeTransferItem } from "./mappers.js";
import { applyStockMovement, assertSufficientStock } from "./stock.service.js";

function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}

function serializeTransfer<T extends { items?: unknown[] }>(transfer: T) {
  if (!transfer.items) {
    return transfer;
  }
  return {
    ...transfer,
    items: (transfer.items as Array<Parameters<typeof serializeTransferItem>[0]>).map(serializeTransferItem),
  };
}

export async function listTransfers(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const { page, pageSize, skip, take } = paginationParams(req.query);

  const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
  const status = typeof req.query.status === "string" ? (req.query.status as StockTransferStatus) : undefined;

  const where: Prisma.StockTransferWhereInput = {
    businessId: tenant.businessId,
    ...(status ? { status } : {}),
    ...(warehouseId ? { OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] } : {}),
  };

  const [total, transfers] = await Promise.all([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { items: true },
    }),
  ]);

  return sendData(res, transfers.map(serializeTransfer), 200, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function getTransfer(req: Request, res: Response) {
  const { tenant } = assertTenant(req);
  const transfer = await prisma.stockTransfer.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: { items: true },
  });
  if (!transfer) {
    throw notFound("Stock transfer not found");
  }
  return sendData(res, serializeTransfer(transfer));
}

/**
 * Creates the transfer and immediately dispatches it: an outbound
 * TRANSFER_OUT movement (negative quantity) is written for every item
 * against `fromWarehouseId`, inside one prisma.$transaction. Stock is
 * decremented on dispatch and only re-appears once `receiveTransfer` is
 * called for the inbound TRANSFER_IN leg — total quantity across both
 * warehouses is conserved once both legs have run.
 */
export async function createTransfer(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = createStockTransferSchema.parse(req.body);

  if (input.fromWarehouseId === input.toWarehouseId) {
    throw badRequest("Source and destination warehouses must be different");
  }

  const [fromWarehouse, toWarehouse] = await Promise.all([
    prisma.warehouse.findFirst({ where: { id: input.fromWarehouseId, businessId: tenant.businessId } }),
    prisma.warehouse.findFirst({ where: { id: input.toWarehouseId, businessId: tenant.businessId } }),
  ]);
  if (!fromWarehouse) {
    throw notFound("Source warehouse not found");
  }
  if (!toWarehouse) {
    throw notFound("Destination warehouse not found");
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId: tenant.businessId },
  });
  const productIdSet = new Set(products.map((product) => product.id));
  for (const item of input.items) {
    if (!productIdSet.has(item.productId)) {
      throw notFound(`Product ${item.productId} not found`);
    }
  }

  const variantIds = [...new Set(input.items.map((item) => item.variantId).filter((id): id is string => Boolean(id)))];
  if (variantIds.length > 0) {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds }, businessId: tenant.businessId },
    });
    const variantIdSet = new Set(variants.map((variant) => variant.id));
    for (const item of input.items) {
      if (item.variantId && !variantIdSet.has(item.variantId)) {
        throw notFound(`Variant ${item.variantId} not found`);
      }
    }
  }

  const transfer = await prisma.$transaction(async (tx) => {
    const created = await tx.stockTransfer.create({
      data: {
        businessId: tenant.businessId,
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
        status: "IN_TRANSIT",
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        requestedById: auth.userId,
      },
    });

    for (const item of input.items) {
      await assertSufficientStock(tx, {
        businessId: tenant.businessId,
        warehouseId: fromWarehouse.id,
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: String(item.quantity),
      });

      const outboundMovement = await applyStockMovement(tx, {
        businessId: tenant.businessId,
        warehouseId: fromWarehouse.id,
        productId: item.productId,
        variantId: item.variantId ?? null,
        type: "TRANSFER_OUT",
        quantity: `-${item.quantity}`,
        referenceType: "StockTransfer",
        referenceId: created.id,
        notes: input.notes ?? null,
        createdById: auth.userId,
      });

      await tx.stockTransferItem.create({
        data: {
          businessId: tenant.businessId,
          transferId: created.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
          outboundMovementId: outboundMovement.id,
        },
      });
    }

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "stock-transfer.dispatch",
        entityType: "StockTransfer",
        entityId: created.id,
        metadata: { fromWarehouseId: fromWarehouse.id, toWarehouseId: toWarehouse.id, itemCount: input.items.length },
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return tx.stockTransfer.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true },
    });
  });

  return sendData(res, serializeTransfer(transfer), 201);
}

/**
 * Receives a dispatched transfer: writes the inbound TRANSFER_IN movement
 * for every item against `toWarehouseId`. Idempotent against double-receive
 * — a transfer that is not IN_TRANSIT (i.e. already COMPLETED or CANCELLED)
 * is rejected with 409 rather than creating duplicate inbound movements.
 */
export async function receiveTransfer(req: Request, res: Response) {
  const { tenant, auth } = assertTenant(req);
  const input = receiveStockTransferSchema.parse(req.body);

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id: req.params.id, businessId: tenant.businessId },
    include: { items: true },
  });
  if (!transfer) {
    throw notFound("Stock transfer not found");
  }
  if (transfer.status !== "IN_TRANSIT") {
    throw conflict(`Transfer cannot be received while status is ${transfer.status}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      if (item.inboundMovementId) {
        continue;
      }
      const inboundMovement = await applyStockMovement(tx, {
        businessId: tenant.businessId,
        warehouseId: transfer.toWarehouseId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        type: "TRANSFER_IN",
        quantity: item.quantity.toString(),
        referenceType: "StockTransfer",
        referenceId: transfer.id,
        notes: input.notes ?? null,
        createdById: auth.userId,
      });

      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: { inboundMovementId: inboundMovement.id },
      });
    }

    const completed = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await writeAudit(
      {
        businessId: tenant.businessId,
        userId: auth.userId,
        action: "stock-transfer.receive",
        entityType: "StockTransfer",
        entityId: transfer.id,
        ipAddress: clientIp(req.ip),
      },
      tx,
    );

    return tx.stockTransfer.findUniqueOrThrow({
      where: { id: completed.id },
      include: { items: true },
    });
  });

  return sendData(res, serializeTransfer(updated));
}
