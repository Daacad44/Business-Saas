import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as purchaseReturnsService from "./purchase-returns.service.js";
import * as purchasesService from "./purchases.service.js";

export const purchasesRouter = Router();

purchasesRouter.get(
  "/returns",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(purchaseReturnsService.listPurchaseReturns),
);
purchasesRouter.get(
  "/returns/:returnId",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(purchaseReturnsService.getPurchaseReturn),
);

purchasesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(purchasesService.listPurchases),
);
purchasesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(purchasesService.createPurchase),
);
purchasesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(purchasesService.getPurchase),
);
purchasesRouter.post(
  "/:id/returns",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(purchaseReturnsService.createPurchaseReturn),
);
