import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { sendError } from "../lib/response.js";
import { env } from "../lib/env.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return sendError(res, 400, "VALIDATION_ERROR", "Invalid request", err.flatten());
  }

  if (err instanceof AppError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  if (env.NODE_ENV !== "production") {
    console.error(err);
  }
  return sendError(res, 500, "INTERNAL_ERROR", env.NODE_ENV === "production" ? "Internal server error" : message);
}
