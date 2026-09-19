import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as rolesService from "./roles.service.js";

export const rolesRouter = Router();
export const permissionsRouter = Router();

rolesRouter.get("/", requireAuth, requireTenant, asyncHandler(rolesService.listRoles));
rolesRouter.post("/", requireAuth, requireTenant, requirePermission("users.manage"), asyncHandler(rolesService.createRole));
rolesRouter.patch("/:id", requireAuth, requireTenant, requirePermission("users.manage"), asyncHandler(rolesService.updateRole));

permissionsRouter.get("/", requireAuth, requireTenant, asyncHandler(rolesService.listPermissions));
