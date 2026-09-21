"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export function ReportSectionSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: cards }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-3xl" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <Skeleton className="h-64 w-full rounded-3xl" />;
}

export function QueryPanel({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  skeleton,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: string;
  onRetry: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (isError) return <ErrorState description={error} onRetry={onRetry} />;
  if (isEmpty) return <EmptyState title={emptyTitle ?? ""} description={emptyDescription} />;
  return <>{children}</>;
}
