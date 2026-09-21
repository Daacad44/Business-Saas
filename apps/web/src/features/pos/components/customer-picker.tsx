"use client";

import type { CustomerSummary } from "@daljir/types";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { listCustomers } from "@/features/customers/api";
import { customerKeys } from "@/features/customers/hooks";
import { userFacingError } from "@/lib/form-resolver";
import { cn } from "@/lib/utils";

export function CustomerPicker({
  label,
  value,
  onChange,
  disabled,
  error,
  required,
}: {
  label: string;
  value: CustomerSummary | null;
  onChange: (customer: CustomerSummary | null) => void;
  disabled?: boolean;
  error?: string;
  required?: boolean;
}) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const inputId = React.useId();
  const listboxId = `${inputId}-listbox`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const [draft, setDraft] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlightState, setHighlightState] = React.useState({ key: "", index: 0 });

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(draft.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [draft]);

  const customers = useQuery({
    queryKey: customerKeys.list({ page: 1, pageSize: 20, search: debounced, status: "ACTIVE" }),
    queryFn: () => listCustomers({ page: 1, pageSize: 20, search: debounced || undefined, status: "ACTIVE" }),
    enabled: open || Boolean(debounced),
    placeholderData: (previous) => previous,
  });

  const rows = customers.data?.data ?? [];
  const resultsKey = `${debounced}:${customers.dataUpdatedAt}`;
  const highlight = highlightState.key === resultsKey ? highlightState.index : 0;

  function setHighlight(index: number | ((current: number) => number)) {
    const next = typeof index === "function" ? index(highlight) : index;
    setHighlightState({ key: resultsKey, index: next });
  }

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const displayValue = open || !value ? draft : value.fullName;

  function confirm(customer: CustomerSummary) {
    onChange(customer);
    setDraft(customer.fullName);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setDraft("");
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
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
          aria-invalid={Boolean(error)}
          aria-busy={customers.isLoading}
          disabled={disabled}
          autoComplete="off"
          value={displayValue}
          placeholder={t("customerPlaceholder")}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlight((current) => Math.min(current + 1, Math.max(rows.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const row = rows[highlight];
              if (row) confirm(row);
            }
          }}
          className="h-11 w-full rounded-xl border border-line bg-paper pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-50"
        />
        {value || draft ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label={tc("clearSearch")}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-line bg-paper shadow-lg"
        >
          {customers.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : null}
          {customers.isError ? (
            <ErrorState
              description={userFacingError(customers.error, tc("error"), tc("forbidden"))}
              onRetry={() => customers.refetch()}
              className="rounded-none border-0 py-8"
            />
          ) : null}
          {!customers.isLoading && !customers.isError && rows.length === 0 ? (
            <EmptyState title={t("noCustomers")} className="rounded-none border-0 py-8" />
          ) : null}
          {!customers.isLoading && !customers.isError
            ? rows.map((customer, index) => (
                <button
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => confirm(customer)}
                  className={cn(
                    "flex w-full flex-col px-4 py-2.5 text-left text-sm",
                    index === highlight ? "bg-teal/10 text-teal-dark" : "text-ink hover:bg-sand/60",
                  )}
                >
                  <span className="font-semibold">{customer.fullName}</span>
                  <span className="text-xs text-muted">{customer.phone ?? customer.email ?? "—"}</span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
