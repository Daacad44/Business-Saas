import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as businessesService from "./businesses.service.js";

export const businessesRouter = Router();

businessesRouter.post("/", requireAuth, asyncHandler(businessesService.createBusiness));
businessesRouter.get("/current", requireAuth, requireTenant, asyncHandler(businessesService.getCurrent));
businessesRouter.patch(
  "/current",
  requireAuth,
  requireTenant,
  requirePermission("settings.manage"),
  asyncHandler(businessesService.updateCurrent),
);
businessesRouter.get("/current/settings", requireAuth, requireTenant, asyncHandler(businessesService.getSettings));
businessesRouter.patch(
  "/current/settings",
  requireAuth,
  requireTenant,
  requirePermission("settings.manage"),
  asyncHandler(businessesService.updateSettings),
);
