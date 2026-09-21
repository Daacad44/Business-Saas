import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as purchaseOrdersService from "./purchase-orders.service.js";

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(purchaseOrdersService.listPurchaseOrders),
);
purchaseOrdersRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(purchaseOrdersService.createPurchaseOrder),
);
purchaseOrdersRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(purchaseOrdersService.getPurchaseOrder),
);
purchaseOrdersRouter.post(
  "/:id/approve",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(purchaseOrdersService.approvePurchaseOrder),
);
purchaseOrdersRouter.post(
  "/:id/cancel",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(purchaseOrdersService.cancelPurchaseOrder),
);
