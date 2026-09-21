import { PurchaseReturnFormPage } from "@/features/purchases/components/purchase-return-form-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchaseReturnFormPage purchaseId={id} />;
}
