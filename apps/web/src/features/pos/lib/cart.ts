import { add, mustParseDecimal, toFixed } from "./decimal-math";

export type CartLine = {
  key: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  unitPrice: string;
  taxRate: string;
  quantity: string;
  discountAmount: string;
};

export function cartLineKey(productId: string, variantId: string | null): string {
  return `${productId}:${variantId ?? ""}`;
}

export function incrementQuantity(current: string, delta = "1"): string {
  return toFixed(add(mustParseDecimal(current), mustParseDecimal(delta)), 3);
}
