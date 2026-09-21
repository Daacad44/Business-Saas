import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as stockAdjustmentsService from "./stock-adjustments.service.js";

export const stockAdjustmentsRouter = Router();

stockAdjustmentsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockAdjustmentsService.listAdjustments),
);
stockAdjustmentsRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockAdjustmentsService.getAdjustment),
);
stockAdjustmentsRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.adjust"),
  asyncHandler(stockAdjustmentsService.createAdjustment),
);
