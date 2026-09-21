"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Disables Escape-to-close and click-outside-to-close, e.g. while a mutation is in flight. */
  preventClose?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const NO_OP_SUBSCRIBE = () => () => {};

/** True once mounted on the client, without desyncing SSR/hydration output via an effect-driven setState. */
function useHasMounted(): boolean {
  return React.useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    () => true,
    () => false,
  );
}

export function Modal({ open, onClose, title, description, children, footer, className, preventClose }: ModalProps) {
  const t = useTranslations("common");
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const mounted = useHasMounted();

  React.useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialogNode = dialogRef.current;
    const focusables = dialogNode?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables?.[0] ?? dialogNode)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !preventClose) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const nodes = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousActiveElement.current?.focus();
    };
  }, [open, onClose, preventClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !preventClose) onClose();
      }}
    >
      <div className="absolute inset-0 bg-ink/40" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-3xl border border-line bg-paper p-6 shadow-xl focus:outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-2xl text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={preventClose}
            aria-label={t("close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
