import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as branchesService from "./branches.service.js";

export const branchesRouter = Router();

branchesRouter.get("/", requireAuth, requireTenant, requirePermission("settings.manage"), asyncHandler(branchesService.listBranches));
branchesRouter.post("/", requireAuth, requireTenant, requirePermission("settings.manage"), asyncHandler(branchesService.createBranch));
branchesRouter.patch("/:id", requireAuth, requireTenant, requirePermission("settings.manage"), asyncHandler(branchesService.updateBranch));
