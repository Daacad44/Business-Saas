import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as expensesService from "./expenses.service.js";

export const expensesRouter = Router();

expensesRouter.get(
  "/summary/by-category",
  requireAuth,
  requireTenant,
  requirePermission("expenses.read"),
  asyncHandler(expensesService.getExpenseTotalsByCategory),
);

expensesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("expenses.read"),
  asyncHandler(expensesService.listExpenses),
);
expensesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("expenses.create"),
  asyncHandler(expensesService.createExpense),
);
expensesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("expenses.read"),
  asyncHandler(expensesService.getExpense),
);
expensesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("expenses.create"),
  asyncHandler(expensesService.updateExpense),
);
expensesRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("expenses.create"),
  asyncHandler(expensesService.deleteExpense),
);
