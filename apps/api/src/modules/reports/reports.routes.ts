import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import { getDashboard } from "./dashboard.service.js";
import {
  getExpiringBatches,
  getInventoryValuation,
  getLowStock,
  getSlowMovingStock,
  getStockMovementSummary,
} from "./inventory.service.js";
import { getPayablesReport } from "./payables.service.js";
import { getExpensesReport, getPurchasesReport } from "./purchases.service.js";
import { getProfitByProduct, getProfitReport } from "./profit.service.js";
import { getCollectionsSummary, getReceivablesAging } from "./receivables.service.js";
import {
  getSalesByBranch,
  getSalesByCustomer,
  getSalesByPaymentMethod,
  getSalesByProduct,
  getSalesReport,
  getTopProducts,
} from "./sales.service.js";

export const reportsRouter = Router();

const guard = [requireAuth, requireTenant, requirePermission("reports.read")] as const;

reportsRouter.get("/dashboard", ...guard, asyncHandler(getDashboard));

reportsRouter.get("/sales", ...guard, asyncHandler(getSalesReport));
reportsRouter.get("/sales/by-branch", ...guard, asyncHandler(getSalesByBranch));
reportsRouter.get("/sales/by-customer", ...guard, asyncHandler(getSalesByCustomer));
reportsRouter.get("/sales/by-product", ...guard, asyncHandler(getSalesByProduct));
reportsRouter.get("/sales/by-payment-method", ...guard, asyncHandler(getSalesByPaymentMethod));
reportsRouter.get("/sales/top-products", ...guard, asyncHandler(getTopProducts));

reportsRouter.get("/inventory/valuation", ...guard, asyncHandler(getInventoryValuation));
reportsRouter.get("/inventory/movements", ...guard, asyncHandler(getStockMovementSummary));
reportsRouter.get("/inventory/low-stock", ...guard, asyncHandler(getLowStock));
reportsRouter.get("/inventory/expiring-batches", ...guard, asyncHandler(getExpiringBatches));
reportsRouter.get("/inventory/slow-moving", ...guard, asyncHandler(getSlowMovingStock));

reportsRouter.get("/profit", ...guard, asyncHandler(getProfitReport));
reportsRouter.get("/profit/by-product", ...guard, asyncHandler(getProfitByProduct));

reportsRouter.get("/receivables/aging", ...guard, asyncHandler(getReceivablesAging));
reportsRouter.get("/receivables/collections", ...guard, asyncHandler(getCollectionsSummary));

reportsRouter.get("/purchases", ...guard, asyncHandler(getPurchasesReport));
reportsRouter.get("/expenses", ...guard, asyncHandler(getExpensesReport));

reportsRouter.get("/payables", ...guard, asyncHandler(getPayablesReport));
