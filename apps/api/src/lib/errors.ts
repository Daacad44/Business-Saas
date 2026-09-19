export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Authentication required") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "You do not have permission to do this") {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found") {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message: string) {
  return new AppError(409, "CONFLICT", message);
}

export function tooMany(message = "Too many attempts. Try again later.") {
  return new AppError(429, "RATE_LIMITED", message);
}
