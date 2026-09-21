import {
  add,
  clamp,
  divide,
  isNegative,
  mustParseDecimal,
  multiply,
  subtract,
  toFixed,
  ZERO,
  type DecimalValue,
} from "./decimal-math";

export type CartLinePreviewInput = {
  unitPrice: string;
  quantity: string;
  taxRate: string;
  discountAmount: string;
};

export type LinePreview = {
  lineSubtotal: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
};

export type CartPreview = {
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  lines: LinePreview[];
};

const HUNDRED = mustParseDecimal("100");

/**
 * Mirrors `apps/api/src/modules/sales/sales.service.ts` line + sale totals.
 * Money strings are 2-decimal, round-half-up — the same as Prisma `toFixed(2)`.
 */
export function previewCartTotals(
  lines: CartLinePreviewInput[],
  orderDiscountAmount = "0",
): CartPreview {
  const linePreviews: Array<{
    rawSubtotal: DecimalValue;
    discount: DecimalValue;
    tax: DecimalValue;
    total: DecimalValue;
  }> = [];

  for (const line of lines) {
    const unitPrice = mustParseDecimal(line.unitPrice);
    const quantity = mustParseDecimal(line.quantity);
    const taxRate = mustParseDecimal(line.taxRate);
    const rawSubtotal = multiply(unitPrice, quantity);
    const discount = clamp(mustParseDecimal(line.discountAmount), ZERO, rawSubtotal);
    const taxable = subtract(rawSubtotal, discount);
    const tax = divide(multiply(taxable, taxRate), HUNDRED);
    const total = add(taxable, tax);
    linePreviews.push({ rawSubtotal, discount, tax, total });
  }

  const subtotal = linePreviews.reduce((sum, line) => add(sum, line.rawSubtotal), ZERO);
  const itemDiscountTotal = linePreviews.reduce((sum, line) => add(sum, line.discount), ZERO);
  const itemTaxTotal = linePreviews.reduce((sum, line) => add(sum, line.tax), ZERO);
  const remainingAfterItemDiscount = subtract(subtotal, itemDiscountTotal);
  const additionalDiscount = clamp(
    mustParseDecimal(orderDiscountAmount),
    ZERO,
    isNegative(remainingAfterItemDiscount) ? ZERO : remainingAfterItemDiscount,
  );
  const totalDiscount = add(itemDiscountTotal, additionalDiscount);
  const totalAmount = add(subtract(subtotal, totalDiscount), itemTaxTotal);

  return {
    subtotal: toFixed(subtotal, 2),
    discountAmount: toFixed(totalDiscount, 2),
    taxAmount: toFixed(itemTaxTotal, 2),
    totalAmount: toFixed(totalAmount, 2),
    lines: linePreviews.map((line) => ({
      lineSubtotal: toFixed(line.rawSubtotal, 2),
      discountAmount: toFixed(line.discount, 2),
      taxAmount: toFixed(line.tax, 2),
      lineTotal: toFixed(line.total, 2),
    })),
  };
}
