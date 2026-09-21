import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as historyService from "./history.service.js";
import * as sendTestService from "./send-test.service.js";
import * as templatesService from "./templates.service.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/templates",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(templatesService.listTemplates),
);
notificationsRouter.post(
  "/templates",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(templatesService.createTemplate),
);
notificationsRouter.get(
  "/templates/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(templatesService.getTemplate),
);
notificationsRouter.patch(
  "/templates/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(templatesService.updateTemplate),
);
notificationsRouter.delete(
  "/templates/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(templatesService.deleteTemplate),
);
notificationsRouter.post(
  "/templates/:id/preview",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(templatesService.previewTemplate),
);

notificationsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(historyService.listNotifications),
);
notificationsRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(historyService.getNotification),
);
notificationsRouter.get(
  "/:id/logs",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(historyService.listNotificationLogs),
);

notificationsRouter.post(
  "/send-test",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(sendTestService.sendTestNotification),
);
