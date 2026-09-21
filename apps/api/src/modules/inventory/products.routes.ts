import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as productsService from "./products.service.js";
import * as variantsService from "./variants.service.js";

export const productsRouter = Router();

productsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(productsService.listProducts),
);
productsRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(productsService.getProduct),
);
productsRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(productsService.createProduct),
);
productsRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(productsService.updateProduct),
);
productsRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(productsService.deleteProduct),
);

productsRouter.get(
  "/:productId/variants",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(variantsService.listVariants),
);
productsRouter.get(
  "/:productId/variants/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(variantsService.getVariant),
);
productsRouter.post(
  "/:productId/variants",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(variantsService.createVariant),
);
productsRouter.patch(
  "/:productId/variants/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(variantsService.updateVariant),
);
productsRouter.delete(
  "/:productId/variants/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.create"),
  asyncHandler(variantsService.deleteVariant),
);
