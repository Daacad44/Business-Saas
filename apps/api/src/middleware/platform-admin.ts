import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../lib/errors.js";

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(unauthorized());
    return;
  }
  if (req.auth.user.platformRole !== "SUPER_ADMIN") {
    next(forbidden("Platform administrator access required"));
    return;
  }
  next();
}
