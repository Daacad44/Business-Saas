import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as expenseCategoriesService from "./expense-categories.service.js";

export const expenseCategoriesRouter = Router();

expenseCategoriesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("expenses.read"),
  asyncHandler(expenseCategoriesService.listExpenseCategories),
);
expenseCategoriesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("expenses.create"),
  asyncHandler(expenseCategoriesService.createExpenseCategory),
);
expenseCategoriesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("expenses.read"),
  asyncHandler(expenseCategoriesService.getExpenseCategory),
);
expenseCategoriesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("expenses.create"),
  asyncHandler(expenseCategoriesService.updateExpenseCategory),
);
expenseCategoriesRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("expenses.create"),
  asyncHandler(expenseCategoriesService.deleteExpenseCategory),
);
