"use client";

import { useQuery } from "@tanstack/react-query";
import { getProduct } from "@/features/inventory/api";
import { inventoryKeys } from "@/features/inventory/hooks";

export function ProductName({ productId }: { productId: string }) {
  const product = useQuery({
    queryKey: inventoryKeys.product(productId),
    queryFn: () => getProduct(productId),
    staleTime: 60_000,
  });
  if (product.data) return <>{product.data.name}</>;
  if (product.isLoading) return <span className="inline-block h-4 w-24 animate-pulse rounded bg-line/60" />;
  return <>{productId.slice(0, 8)}</>;
}
