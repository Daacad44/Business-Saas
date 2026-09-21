import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./form";

export interface StatCardDelta {
  value: string;
  direction: "up" | "down" | "neutral";
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  delta?: StatCardDelta;
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, delta, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <p className="text-sm font-medium text-muted">{label}</p>
        <p className="mt-2 font-display text-3xl text-ink">{value}</p>
        {delta ? (
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-xs font-semibold",
              delta.direction === "up" && "text-emerald-700",
              delta.direction === "down" && "text-red-700",
              delta.direction === "neutral" && "text-muted",
            )}
          >
            {delta.direction === "up" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {delta.direction === "down" ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {delta.value}
          </p>
        ) : null}
      </div>
      {Icon ? (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal/10 text-teal">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      ) : null}
    </Card>
  );
}
