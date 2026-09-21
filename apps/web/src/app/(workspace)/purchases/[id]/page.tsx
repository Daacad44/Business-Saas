import { PurchaseDetailPage } from "@/features/purchases/components/purchase-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchaseDetailPage purchaseId={id} />;
}
