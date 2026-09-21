/**
 * Minimal structured-logger contract the package depends on. Both apps
 * inject their own logger implementation (DI) — the package never reads
 * `process.env` or constructs its own logger — so each app's existing log
 * format/transport is preserved unchanged.
 */
export interface NotificationsLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
