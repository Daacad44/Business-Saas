import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as stockMovementsService from "./stock-movements.service.js";

export const stockMovementsRouter = Router();

// Read-only ledger. No POST route exists here by design (see CLAUDE.md rule 6):
// every StockMovement is created transactionally alongside a StockLevel update
// via applyStockMovement, from within adjustments/transfers/sales/purchases.
stockMovementsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockMovementsService.listMovements),
);
stockMovementsRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("inventory.read"),
  asyncHandler(stockMovementsService.getMovement),
);
