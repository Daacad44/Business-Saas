import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as batchesService from "./batches.service.js";

export const batchesRouter = Router();

batchesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(batchesService.listBatches),
);
batchesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(batchesService.getBatch),
);
batchesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(batchesService.createBatch),
);
