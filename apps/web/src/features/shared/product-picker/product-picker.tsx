"use client";

import type { ProductSummary } from "@daljir/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { listProducts } from "@/features/inventory/api";
import { formatMoney } from "@/lib/format";
import { userFacingError } from "@/lib/form-resolver";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 20;
const DEBOUNCE_MS = 250;

/**
 * Async searchable product picker.
 *
 * Queries `GET /api/v1/products` with a debounced `search` term (name, SKU,
 * barcode) and paginates via `useInfiniteQuery`. Loading, empty, error, and
 * retry states are rendered inside the listbox. Results are not capped at a
 * 100-row dropdown — "Load more" walks every page the API returns.
 */
export interface ProductPickerProps {
  id?: string;
  label: string;
  placeholder?: string;
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  value?: string | null;
  onChange?: (product: ProductSummary | null) => void;
  onSelect?: (product: ProductSummary) => void;
  /** POS scan mode. After a confirmed selection the input is cleared. */
  clearOnSelect?: boolean;
  activeOnly?: boolean;
  pageSize?: number;
}

function findExactMatch(products: ProductSummary[], query: string): ProductSummary | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const barcodeMatch = products.find((product) => product.barcode === trimmed);
  if (barcodeMatch) return barcodeMatch;
  const lower = trimmed.toLowerCase();
  return products.find((product) => product.sku.toLowerCase() === lower);
}

export function ProductPicker({
  id,
  label,
  placeholder,
  description,
  error,
  required,
  disabled,
  autoFocus,
  className,
  value,
  onChange,
  onSelect,
  clearOnSelect = false,
  activeOnly = true,
  pageSize = DEFAULT_PAGE_SIZE,
}: ProductPickerProps) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;

  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const [draft, setDraft] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlightState, setHighlightState] = React.useState({ key: "", index: 0 });
  const [selectedProduct, setSelectedProduct] = React.useState<ProductSummary | null>(null);
  const [lookupPending, setLookupPending] = React.useState(false);

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(draft.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draft]);

  const productsQuery = useInfiniteQuery({
    queryKey: ["inventory", "products", "picker", { search: debounced, pageSize, activeOnly }],
    queryFn: ({ pageParam }) =>
      listProducts({
        page: pageParam,
        pageSize,
        search: debounced || undefined,
        status: activeOnly ? "ACTIVE" : undefined,
        sortBy: "name",
        sortDir: "asc",
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
    enabled: open || Boolean(debounced),
  });

  const products = React.useMemo(
    () => productsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [productsQuery.data],
  );

  const resultsKey = `${debounced}:${productsQuery.dataUpdatedAt}`;
  const highlight = highlightState.key === resultsKey ? highlightState.index : 0;

  function setHighlight(index: number | ((current: number) => number)) {
    const next = typeof index === "function" ? index(highlight) : index;
    setHighlightState({ key: resultsKey, index: next });
  }

  const resolvedSelected = clearOnSelect
    ? null
    : value
      ? selectedProduct?.id === value
        ? selectedProduct
        : (products.find((product) => product.id === value) ?? selectedProduct)
      : null;

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const displayValue = open || clearOnSelect || !resolvedSelected ? draft : resolvedSelected.name;

  function confirmProduct(product: ProductSummary) {
    onSelect?.(product);
    if (clearOnSelect) {
      setDraft("");
      setDebounced("");
      setSelectedProduct(null);
      onChange?.(null);
    } else {
      setSelectedProduct(product);
      setDraft(product.name);
      onChange?.(product);
    }
    setOpen(false);
    inputRef.current?.focus();
  }

  async function confirmFromEnter() {
    const query = draft.trim();
    const localExact = findExactMatch(products, query);
    if (localExact) {
      confirmProduct(localExact);
      return;
    }
    if (query) {
      setLookupPending(true);
      try {
        const result = await listProducts({
          page: 1,
          pageSize,
          search: query,
          status: activeOnly ? "ACTIVE" : undefined,
          sortBy: "name",
          sortDir: "asc",
        });
        const exact = findExactMatch(result.data, query);
        if (exact) {
          confirmProduct(exact);
          return;
        }
      } catch {
        // Fall through to the highlighted row; the listbox already shows error/retry.
      } finally {
        setLookupPending(false);
      }
    }
    const highlighted = products[highlight];
    if (highlighted) confirmProduct(highlighted);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setDraft("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, Math.max(products.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void confirmFromEnter();
    }
  }

  function clear() {
    setDraft("");
    setDebounced("");
    setSelectedProduct(null);
    onChange?.(null);
    setOpen(true);
    inputRef.current?.focus();
  }

  const describedBy =
    [error ? errorId : null, !error && description ? descriptionId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-copper">*</span> : null}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && products[highlight] ? `${listboxId}-option-${highlight}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          aria-required={required}
          aria-busy={productsQuery.isLoading || lookupPending}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          value={displayValue}
          placeholder={placeholder ?? t("productPicker.placeholder")}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-xl border border-line bg-paper pl-9 pr-16 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-50"
        />
        {draft || selectedProduct ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label={tc("clearSearch")}
            className="absolute right-9 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </div>
      {description && !error ? (
        <p id={descriptionId} className="mt-1.5 text-xs text-muted">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-paper shadow-lg"
        >
          {productsQuery.isLoading || lookupPending ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          {productsQuery.isError ? (
            <ErrorState
              description={userFacingError(productsQuery.error, tc("error"), tc("forbidden"))}
              onRetry={() => productsQuery.refetch()}
              className="rounded-none border-0 py-8"
            />
          ) : null}

          {!productsQuery.isLoading && !lookupPending && !productsQuery.isError && products.length === 0 ? (
            <EmptyState
              title={t("productPicker.empty")}
              description={t("productPicker.emptyDescription")}
              className="rounded-none border-0 py-8"
            />
          ) : null}

          {!productsQuery.isLoading && !lookupPending && !productsQuery.isError
            ? products.map((product, index) => {
                const active = index === highlight;
                return (
                  <button
                    key={product.id}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => confirmProduct(product)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm",
                      active ? "bg-teal/10 text-teal-dark" : "text-ink hover:bg-sand/60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{product.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">{formatMoney(product.sellingPrice)}</span>
                  </button>
                );
              })
            : null}

          {productsQuery.hasNextPage ? (
            <div className="border-t border-line p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={productsQuery.isFetchingNextPage}
                onClick={() => productsQuery.fetchNextPage()}
              >
                {productsQuery.isFetchingNextPage ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {t("productPicker.loadMore")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
