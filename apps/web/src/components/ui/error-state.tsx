"use client";

import { AlertTriangle } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ title, description, onRetry, retryLabel, className }: ErrorStateProps) {
  const t = useTranslations("common");

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-3xl border border-red-200 bg-red-50 px-6 py-12 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-red-700" aria-hidden="true" />
      <p className="font-display text-lg text-red-900">{title ?? t("error")}</p>
      {description ? <p className="max-w-sm text-sm text-red-800/80">{description}</p> : null}
      {onRetry ? (
        <Button type="button" variant="danger" size="sm" className="mt-3" onClick={onRetry}>
          {retryLabel ?? t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
