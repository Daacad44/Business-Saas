import { Suspense } from "react";
import { PurchaseFormPage } from "@/features/purchases/components/purchase-form-page";
import { Skeleton } from "@/components/ui/skeleton";

function Fallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <PurchaseFormPage />
    </Suspense>
  );
}
