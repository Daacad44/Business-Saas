import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as categoriesService from "./categories.service.js";

export const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(categoriesService.listCategories),
);
categoriesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(categoriesService.getCategory),
);
categoriesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(categoriesService.createCategory),
);
categoriesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(categoriesService.updateCategory),
);
categoriesRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(categoriesService.deleteCategory),
);
