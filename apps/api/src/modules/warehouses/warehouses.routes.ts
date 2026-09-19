import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as warehousesService from "./warehouses.service.js";

export const warehousesRouter = Router();

warehousesRouter.get("/", requireAuth, requireTenant, requirePermission("settings.manage"), asyncHandler(warehousesService.listWarehouses));
warehousesRouter.post("/", requireAuth, requireTenant, requirePermission("settings.manage"), asyncHandler(warehousesService.createWarehouse));
warehousesRouter.patch("/:id", requireAuth, requireTenant, requirePermission("settings.manage"), asyncHandler(warehousesService.updateWarehouse));
