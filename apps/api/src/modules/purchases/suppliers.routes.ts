import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as suppliersService from "./suppliers.service.js";

export const suppliersRouter = Router();

suppliersRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(suppliersService.listSuppliers),
);
suppliersRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(suppliersService.createSupplier),
);
suppliersRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(suppliersService.getSupplier),
);
suppliersRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(suppliersService.updateSupplier),
);
suppliersRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(suppliersService.disableSupplier),
);

suppliersRouter.get(
  "/:id/purchases",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(suppliersService.listSupplierPurchases),
);
suppliersRouter.get(
  "/:id/payments",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(suppliersService.listSupplierPayments),
);
suppliersRouter.post(
  "/:id/payments",
  requireAuth,
  requireTenant,
  requirePermission("purchases.create"),
  asyncHandler(suppliersService.createSupplierPayment),
);
