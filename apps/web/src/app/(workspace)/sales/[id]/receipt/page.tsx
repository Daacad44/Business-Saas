import { Suspense } from "react";
import { SaleReceiptPage } from "@/features/sales/components/sale-receipt-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <SaleReceiptPage saleId={id} />
    </Suspense>
  );
}
