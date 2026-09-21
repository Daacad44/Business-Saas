import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission, requireTenant } from "../../middleware/tenant.js";
import * as executionsService from "./executions.service.js";
import * as rulesService from "./rules.service.js";
import * as testRuleService from "./test-rule.service.js";

export const automationRouter = Router();

automationRouter.get(
  "/rules",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(rulesService.listRules),
);
automationRouter.post(
  "/rules",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(rulesService.createRule),
);
automationRouter.get(
  "/rules/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(rulesService.getRule),
);
automationRouter.patch(
  "/rules/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(rulesService.updateRule),
);
automationRouter.delete(
  "/rules/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(rulesService.deleteRule),
);
automationRouter.post(
  "/rules/:id/activate",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(rulesService.activateRule),
);
automationRouter.post(
  "/rules/:id/deactivate",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(rulesService.deactivateRule),
);
automationRouter.post(
  "/rules/:id/test",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(testRuleService.testRule),
);

automationRouter.get(
  "/executions",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(executionsService.listExecutions),
);
automationRouter.get(
  "/executions/:id",
  requireAuth,
  requireTenant,
  requirePermission("automation.manage"),
  asyncHandler(executionsService.getExecution),
);
