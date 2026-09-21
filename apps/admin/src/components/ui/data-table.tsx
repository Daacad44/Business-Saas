"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { Skeleton } from "./skeleton";

export type SortDirection = "asc" | "desc";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "start" | "end" | "center";
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Visually hidden `<caption>` describing the table's purpose to screen readers. */
  caption: string;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  sortBy?: string;
  sortDirection?: SortDirection;
  onSortChange?: (columnId: string) => void;
  rowActions?: (row: T) => React.ReactNode;
  rowActionsHeader?: string;
  skeletonRowCount?: number;
  onRowClick?: (row: T) => void;
  className?: string;
}

const ALIGN_CLASS: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  start: "text-left",
  end: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  data,
  getRowId,
  caption,
  isLoading = false,
  error,
  onRetry,
  emptyTitle = "No results found",
  emptyDescription,
  sortBy,
  sortDirection,
  onSortChange,
  rowActions,
  rowActionsHeader = "Actions",
  skeletonRowCount = 5,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const columnCount = columns.length + (rowActions ? 1 : 0);

  return (
    <div className={cn("overflow-x-auto rounded-3xl border border-line bg-paper", className)}>
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {columns.map((column) => {
              const isSorted = sortBy === column.id;
              const ariaSort = column.sortable ? (isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none") : undefined;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn("px-4 py-3", ALIGN_CLASS[column.align ?? "start"], column.headerClassName)}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.id)}
                      className="inline-flex items-center gap-1 text-muted transition hover:text-ink"
                    >
                      {column.header}
                      {isSorted ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {rowActions ? (
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">{rowActionsHeader}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-line last:border-0">
                  {Array.from({ length: columnCount }).map((__, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))
            : null}

          {!isLoading && error ? (
            <tr>
              <td colSpan={Math.max(columnCount, 1)} className="p-0">
                <ErrorState onRetry={onRetry} description={error} className="rounded-none border-0" />
              </td>
            </tr>
          ) : null}

          {!isLoading && !error && data.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columnCount, 1)} className="p-0">
                <EmptyState title={emptyTitle} description={emptyDescription} className="rounded-none border-0" />
              </td>
            </tr>
          ) : null}

          {!isLoading && !error
            ? data.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-line last:border-0",
                    onRowClick && "cursor-pointer hover:bg-sand/60",
                  )}
                >
                  {columns.map((column) => (
                    <td key={column.id} className={cn("px-4 py-3 text-ink", ALIGN_CLASS[column.align ?? "start"], column.className)}>
                      {column.accessor(row)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  ) : null}
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}
