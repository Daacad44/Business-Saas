import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as stockTransfersService from "./stock-transfers.service.js";

export const stockTransfersRouter = Router();

stockTransfersRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockTransfersService.listTransfers),
);
stockTransfersRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockTransfersService.getTransfer),
);
stockTransfersRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.transfer"),
  asyncHandler(stockTransfersService.createTransfer),
);
stockTransfersRouter.post(
  "/:id/receive",
  requireAuth,
  requireTenant,
  requirePermission("inventory.transfer"),
  asyncHandler(stockTransfersService.receiveTransfer),
);
