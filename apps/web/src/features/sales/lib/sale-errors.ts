import { ApiError } from "@/lib/api";

export type SaleConflictReason =
  | "LIMIT_EXCEEDED"
  | "OVERDUE_DEBT"
  | "CUSTOMER_DISABLED"
  | "INSUFFICIENT_STOCK"
  | "CREDIT_REQUIRES_CUSTOMER"
  | "OVER_RETURN"
  | "ALREADY_PAID"
  | "VOID_INVOICE"
  | "PAYMENT_EXCEEDS_DUE"
  | "GENERIC";

const PATTERNS: Array<{ reason: SaleConflictReason; test: (message: string) => boolean }> = [
  { reason: "LIMIT_EXCEEDED", test: (message) => message.includes("LIMIT_EXCEEDED") },
  { reason: "OVERDUE_DEBT", test: (message) => message.includes("OVERDUE_DEBT") },
  { reason: "CUSTOMER_DISABLED", test: (message) => message.includes("CUSTOMER_DISABLED") },
  { reason: "INSUFFICIENT_STOCK", test: (message) => /insufficient stock/i.test(message) },
  {
    reason: "CREDIT_REQUIRES_CUSTOMER",
    test: (message) => /credit sales require a customer/i.test(message),
  },
  {
    reason: "OVER_RETURN",
    test: (message) => /return quantity exceeds remaining returnable quantity/i.test(message),
  },
  { reason: "ALREADY_PAID", test: (message) => /already fully paid/i.test(message) },
  { reason: "VOID_INVOICE", test: (message) => /invoice is void/i.test(message) },
  {
    reason: "PAYMENT_EXCEEDS_DUE",
    test: (message) => /exceeds the outstanding amount due/i.test(message),
  },
];

export function saleConflictReason(error: unknown): SaleConflictReason | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const match = PATTERNS.find((pattern) => pattern.test(error.message));
  return match?.reason ?? "GENERIC";
}

const RETURNED_PATTERN =
  /sale item ([0-9a-f-]+) \(sold (\d+(?:\.\d+)?), already returned (\d+(?:\.\d+)?)\)/i;

export function parseOverReturn(error: unknown): {
  sold: string;
  alreadyReturned: string;
  saleItemId: string | null;
} | null {
  if (!(error instanceof ApiError)) return null;
  const match = RETURNED_PATTERN.exec(error.message);
  if (!match) return null;
  return {
    saleItemId: match[1] ?? null,
    sold: match[2] ?? "0",
    alreadyReturned: match[3] ?? "0",
  };
}
