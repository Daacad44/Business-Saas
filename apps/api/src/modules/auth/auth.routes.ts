import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { requireAuth } from "../../middleware/auth.js";
import { authRateLimit } from "../../middleware/rate-limit.js";
import * as authService from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/register", authRateLimit, asyncHandler(authService.register));
authRouter.post("/login", authRateLimit, asyncHandler(authService.login));
authRouter.post("/refresh", asyncHandler(authService.refresh));
authRouter.post("/logout", asyncHandler(authService.logout));
authRouter.get("/me", requireAuth, asyncHandler(authService.me));
authRouter.post("/switch-business", requireAuth, asyncHandler(authService.switchBusiness));
authRouter.post("/invitations/accept", requireAuth, asyncHandler(authService.acceptInvitation));
