import type { RequestHandler } from "express";
import { ZodSchema } from "zod";

export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}
