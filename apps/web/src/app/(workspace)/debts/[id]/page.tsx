import { DebtDetailPage } from "@/features/debts/components/debt-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DebtDetailPage debtId={id} />;
}
