import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as payablesService from "./payables.service.js";

export const payablesRouter = Router();

payablesRouter.get(
  "/outstanding",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(payablesService.getOutstandingPayables),
);
payablesRouter.get(
  "/aging",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(payablesService.getPayablesAging),
);
payablesRouter.get(
  "/payments",
  requireAuth,
  requireTenant,
  requirePermission("purchases.read"),
  asyncHandler(payablesService.getPayablesPaymentHistory),
);
