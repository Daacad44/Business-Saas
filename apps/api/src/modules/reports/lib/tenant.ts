import type { Request } from "express";
import { forbidden } from "../../../lib/errors.js";

export function assertTenant(req: Request) {
  if (!req.tenant || !req.auth) {
    throw forbidden();
  }
  return { tenant: req.tenant, auth: req.auth };
}
