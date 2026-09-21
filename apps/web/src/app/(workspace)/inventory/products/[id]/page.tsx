import { ProductDetailPage } from "@/features/inventory/components/product-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailPage productId={id} />;
}
