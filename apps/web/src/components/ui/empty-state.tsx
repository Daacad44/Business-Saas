import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line bg-paper/60 px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="h-8 w-8 text-muted" aria-hidden="true" />
      <p className="font-display text-lg text-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
