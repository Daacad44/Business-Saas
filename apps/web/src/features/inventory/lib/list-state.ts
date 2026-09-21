import * as React from "react";
import type { SortDirection } from "@/components/ui/data-table";

export interface ListState<TFilters extends Record<string, string>> {
  page: number;
  pageSize: number;
  search: string;
  filters: TFilters;
  sortBy?: string;
  sortDirection: SortDirection;
}

export interface UseListStateResult<TFilters extends Record<string, string>> {
  state: ListState<TFilters>;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSearch: (search: string) => void;
  setFilter: <K extends keyof TFilters>(key: K, value: TFilters[K]) => void;
  toggleSort: (columnId: string) => void;
  reset: () => void;
}

/**
 * Local UI state for a paginated, searchable, sortable list screen. Any
 * change to search, filters, or sort resets to page 1 so the user never
 * lands on an out-of-range page for the new query.
 */
export function useListState<TFilters extends Record<string, string>>(
  initialFilters: TFilters,
  initialSortBy?: string,
): UseListStateResult<TFilters> {
  const [state, setState] = React.useState<ListState<TFilters>>({
    page: 1,
    pageSize: 20,
    search: "",
    filters: initialFilters,
    sortBy: initialSortBy,
    sortDirection: "asc",
  });

  return {
    state,
    setPage: (page) => setState((current) => ({ ...current, page })),
    setPageSize: (pageSize) => setState((current) => ({ ...current, page: 1, pageSize })),
    setSearch: (search) => setState((current) => ({ ...current, page: 1, search })),
    setFilter: (key, value) =>
      setState((current) => ({ ...current, page: 1, filters: { ...current.filters, [key]: value } })),
    toggleSort: (columnId) =>
      setState((current) => ({
        ...current,
        page: 1,
        sortBy: columnId,
        sortDirection: current.sortBy === columnId && current.sortDirection === "asc" ? "desc" : "asc",
      })),
    reset: () =>
      setState({ page: 1, pageSize: 20, search: "", filters: initialFilters, sortBy: initialSortBy, sortDirection: "asc" }),
  };
}
