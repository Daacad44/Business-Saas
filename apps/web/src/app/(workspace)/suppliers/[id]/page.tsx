import { SupplierDetailPage } from "@/features/purchases/components/supplier-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SupplierDetailPage supplierId={id} />;
}
