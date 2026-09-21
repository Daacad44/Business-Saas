import { InvoiceDetailPage } from "@/features/invoices/components/invoice-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetailPage invoiceId={id} />;
}
