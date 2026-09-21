import { Suspense } from "react";
import { SaleDetailPage } from "@/features/sales/components/sale-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <SaleDetailPage saleId={id} />
    </Suspense>
  );
}
