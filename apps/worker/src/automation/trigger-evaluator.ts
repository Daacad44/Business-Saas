import { createTriggerEvaluator } from "@daljir/automation";
import { prisma } from "../lib/prisma.js";

/**
 * Prisma-bound wrappers around `@daljir/automation`. Evaluation logic
 * MUST NOT live here — dry-run and the worker share one implementation.
 */
const evaluator = createTriggerEvaluator({ prisma });

export const findMatchingDebts = evaluator.findMatchingDebts;
export const findLowStockMatches = evaluator.findLowStockMatches;
export type { LowStockMatch } from "@daljir/automation";
