import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePlatformAdmin } from "../../middleware/platform-admin.js";
import * as adminService from "./admin.service.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requirePlatformAdmin);

adminRouter.get("/overview", asyncHandler(adminService.getOverview));

adminRouter.get("/businesses", asyncHandler(adminService.listBusinesses));
adminRouter.get("/businesses/:id", asyncHandler(adminService.getBusinessDetail));
adminRouter.post("/businesses/:id/suspend", asyncHandler(adminService.suspendBusiness));
adminRouter.post("/businesses/:id/reactivate", asyncHandler(adminService.reactivateBusiness));

adminRouter.get("/users", asyncHandler(adminService.listUsers));
adminRouter.get("/users/:id", asyncHandler(adminService.getUserDetail));
adminRouter.patch("/users/:id/platform-role", asyncHandler(adminService.updatePlatformRole));

adminRouter.get("/system-health", asyncHandler(adminService.getSystemHealth));

adminRouter.get("/audit-logs", asyncHandler(adminService.listAuditLogs));

adminRouter.get("/sessions", asyncHandler(adminService.listSessions));
adminRouter.post("/sessions/:id/revoke", asyncHandler(adminService.revokeSession));
