import { PurchaseOrderDetailPage } from "@/features/purchases/components/purchase-order-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchaseOrderDetailPage orderId={id} />;
}
