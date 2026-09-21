export type LogContext = {
  businessId?: string;
  jobId?: string | number;
  idempotencyKey?: string;
  ruleId?: string;
  debtId?: string;
  executionId?: string;
  [key: string]: unknown;
};

/**
 * Structured logger. Every entry carries business/job/idempotency context
 * for traceability, but NEVER a secret, token, full phone number, email
 * address, or message body (CLAUDE.md rule 10).
 */
function format(level: string, message: string, context?: LogContext) {
  return JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...context,
  });
}

export const logger = {
  info(message: string, context?: LogContext) {
    console.log(format("info", message, context));
  },
  warn(message: string, context?: LogContext) {
    console.warn(format("warn", message, context));
  },
  error(message: string, context?: LogContext) {
    console.error(format("error", message, context));
  },
};
