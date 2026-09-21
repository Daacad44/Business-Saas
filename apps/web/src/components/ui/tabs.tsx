"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  /** Accessible name for the tablist, e.g. "Report sections". */
  label: string;
}

export function Tabs({ items, value, onValueChange, className, label }: TabsProps) {
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  function focusTab(index: number) {
    const target = items[index];
    if (!target) return;
    tabRefs.current[target.value]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabledIndexes = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
    const currentPos = enabledIndexes.indexOf(index);

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextPos = (currentPos + delta + enabledIndexes.length) % enabledIndexes.length;
      const nextIndex = enabledIndexes[nextPos];
      focusTab(nextIndex);
      onValueChange(items[nextIndex].value);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(enabledIndexes[0]);
      onValueChange(items[enabledIndexes[0]].value);
    } else if (event.key === "End") {
      event.preventDefault();
      const lastIndex = enabledIndexes[enabledIndexes.length - 1];
      focusTab(lastIndex);
      onValueChange(items[lastIndex].value);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex items-center gap-1 rounded-full border border-line bg-paper p-1", className)}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              tabRefs.current[item.value] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-40",
              selected ? "bg-teal text-paper" : "text-muted hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  activeValue: string;
}

export function TabPanel({ value, activeValue, children, ...props }: TabPanelProps) {
  if (value !== activeValue) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${value}`} aria-labelledby={`tab-${value}`} tabIndex={0} {...props}>
      {children}
    </div>
  );
}
