import type { Response } from "express";

export function sendData<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>) {
  return res.status(status).json({ data, error: null, meta });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({
    data: null,
    error: { code, message, details },
  });
}
