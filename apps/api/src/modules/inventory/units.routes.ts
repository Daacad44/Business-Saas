import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as unitsService from "./units.service.js";

export const unitsRouter = Router();

unitsRouter.get("/", requireAuth, requireTenant, requirePermission("inventory.read"), asyncHandler(unitsService.listUnits));
unitsRouter.get("/:id", requireAuth, requireTenant, requirePermission("inventory.read"), asyncHandler(unitsService.getUnit));
unitsRouter.post("/", requireAuth, requireTenant, requirePermission("inventory.create"), asyncHandler(unitsService.createUnit));
unitsRouter.patch("/:id", requireAuth, requireTenant, requirePermission("inventory.create"), asyncHandler(unitsService.updateUnit));
unitsRouter.delete("/:id", requireAuth, requireTenant, requirePermission("inventory.create"), asyncHandler(unitsService.deleteUnit));
