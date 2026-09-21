"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible label for the input. Required since the visible placeholder is not a substitute for a label. */
  label: string;
  placeholder?: string;
  /** Debounce delay in ms before `onValueChange` fires. Defaults to 300ms. */
  debounceMs?: number;
  className?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onValueChange,
  label,
  placeholder,
  debounceMs = 300,
  className,
  autoFocus,
}: SearchInputProps) {
  const t = useTranslations("common");
  const [draft, setDraft] = React.useState(value);
  const [syncedValue, setSyncedValue] = React.useState(value);
  const inputId = React.useId();

  // Adopt external value changes (e.g. a "clear filters" action) without an
  // effect, per https://react.dev/learn/you-might-not-need-an-effect.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  React.useEffect(() => {
    if (draft === value) return;
    const handle = setTimeout(() => onValueChange(draft), debounceMs);
    return () => clearTimeout(handle);
  }, [draft, value, debounceMs, onValueChange]);

  function clear() {
    setDraft("");
    onValueChange("");
  }

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        id={inputId}
        type="search"
        value={draft}
        autoFocus={autoFocus}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder ?? t("search")}
        className="h-11 w-full rounded-xl border border-line bg-paper pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal"
      />
      {draft ? (
        <button
          type="button"
          onClick={clear}
          aria-label={t("clearSearch")}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
