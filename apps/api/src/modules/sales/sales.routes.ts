import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as invoicesService from "./invoices.service.js";
import * as paymentsService from "./payments.service.js";
import * as returnsService from "./returns.service.js";
import * as salesService from "./sales.service.js";

export const salesRouter = Router();

salesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("sales.create"),
  asyncHandler(salesService.createSale),
);
salesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("sales.read"),
  asyncHandler(salesService.listSales),
);
salesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("sales.read"),
  asyncHandler(salesService.getSale),
);
salesRouter.post(
  "/:id/return",
  requireAuth,
  requireTenant,
  requirePermission("sales.update"),
  asyncHandler(returnsService.createSalesReturn),
);
salesRouter.post(
  "/:id/payment",
  requireAuth,
  requireTenant,
  requirePermission("debts.collect"),
  asyncHandler(paymentsService.createSalePayment),
);

export const invoicesRouter = Router();

invoicesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("sales.read"),
  asyncHandler(invoicesService.listInvoices),
);
invoicesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("sales.read"),
  asyncHandler(invoicesService.getInvoice),
);
invoicesRouter.get(
  "/:id/receipt",
  requireAuth,
  requireTenant,
  requirePermission("sales.read"),
  asyncHandler(invoicesService.getInvoiceReceipt),
);
