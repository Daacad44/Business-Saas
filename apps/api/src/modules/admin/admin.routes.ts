import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePlatformAdmin } from "../../middleware/platform-admin.js";
import * as adminService from "./admin.service.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requirePlatformAdmin);

adminRouter.get("/overview", asyncHandler(adminService.getOverview));
adminRouter.get("/businesses", asyncHandler(adminService.listBusinesses));
adminRouter.get("/users", asyncHandler(adminService.listUsers));
adminRouter.get("/system-health", asyncHandler(adminService.getSystemHealth));
adminRouter.get("/audit-logs", asyncHandler(adminService.listAuditLogs));
