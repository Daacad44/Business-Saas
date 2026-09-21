import { SaleReturnPage } from "@/features/sales/components/sale-return-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleReturnPage saleId={id} />;
}
