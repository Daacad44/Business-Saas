import { ExpenseFormPage } from "@/features/purchases/components/expense-form-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExpenseFormPage expenseId={id} />;
}
