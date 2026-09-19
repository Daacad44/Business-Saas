import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as usersService from "./users.service.js";

export const usersRouter = Router();
export const invitationsRouter = Router();

usersRouter.get("/", requireAuth, requireTenant, requirePermission("users.manage"), asyncHandler(usersService.listUsers));
usersRouter.post("/invite", requireAuth, requireTenant, requirePermission("users.invite"), asyncHandler(usersService.inviteUser));
usersRouter.patch("/:id", requireAuth, requireTenant, requirePermission("users.manage"), asyncHandler(usersService.updateUser));
usersRouter.delete("/:id", requireAuth, requireTenant, requirePermission("users.manage"), asyncHandler(usersService.removeUser));

invitationsRouter.get("/:token", asyncHandler(usersService.previewInvitation));
