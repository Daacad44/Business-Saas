import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as stockLevelsService from "./stock-levels.service.js";

export const stockLevelsRouter = Router();

stockLevelsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockLevelsService.listStockLevels),
);
stockLevelsRouter.get(
  "/low-stock",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockLevelsService.listLowStock),
);
stockLevelsRouter.get(
  "/valuation",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockLevelsService.getValuation),
);
