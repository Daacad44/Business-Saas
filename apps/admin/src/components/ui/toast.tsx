"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Defaults to 5000. Pass 0 to disable auto-dismiss. */
  durationMs?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
  variant: ToastVariant;
  durationMs: number;
  /** Milliseconds remaining before auto-dismiss, updated whenever the toast is paused. */
  remaining: number;
  running: boolean;
  /** Timestamp when the current running segment began; null while paused. */
  segmentStart: number | null;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-teal/20 bg-teal/5 text-teal-dark",
};

const NO_OP_SUBSCRIBE = () => () => {};

/** True once mounted on the client, without desyncing SSR/hydration output via an effect-driven setState. */
function useHasMounted(): boolean {
  return React.useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    () => true,
    () => false,
  );
}

function useToastTimers(
  toasts: ToastRecord[],
  setToasts: React.Dispatch<React.SetStateAction<ToastRecord[]>>,
) {
  React.useEffect(() => {
    const timers = toasts
      .filter((toastItem) => toastItem.durationMs > 0 && toastItem.running)
      .map((toastItem) =>
        setTimeout(() => {
          setToasts((current) => current.filter((item) => item.id !== toastItem.id));
        }, toastItem.remaining),
      );
    return () => timers.forEach(clearTimeout);
  }, [toasts, setToasts]);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const mounted = useHasMounted();

  useToastTimers(toasts, setToasts);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = crypto.randomUUID();
    const durationMs = options.durationMs ?? 5000;
    setToasts((current) => [
      ...current,
      {
        ...options,
        id,
        variant: options.variant ?? "info",
        durationMs,
        remaining: durationMs,
        running: true,
        segmentStart: Date.now(),
      },
    ]);
    return id;
  }, []);

  function pause(id: string) {
    setToasts((current) =>
      current.map((item) => {
        if (item.id !== id || !item.running || item.segmentStart === null) return item;
        const elapsed = Date.now() - item.segmentStart;
        return { ...item, running: false, segmentStart: null, remaining: Math.max(0, item.remaining - elapsed) };
      }),
    );
  }

  function resume(id: string) {
    setToasts((current) =>
      current.map((item) =>
        item.id === id && !item.running ? { ...item, running: true, segmentStart: Date.now() } : item,
      ),
    );
  }

  const contextValue = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {mounted
        ? createPortal(
            <div
              aria-live="assertive"
              aria-atomic="false"
              className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto"
            >
              {toasts.map((item) => {
                const Icon = VARIANT_ICON[item.variant];
                return (
                  <div
                    key={item.id}
                    role="status"
                    onMouseEnter={() => pause(item.id)}
                    onMouseLeave={() => resume(item.id)}
                    className={cn(
                      "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-lg",
                      VARIANT_CLASSES[item.variant],
                    )}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{item.title}</p>
                      {item.description ? <p className="mt-0.5 text-sm opacity-90">{item.description}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(item.id)}
                      aria-label="Dismiss notification"
                      className="shrink-0 rounded-full p-1 opacity-70 transition hover:opacity-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
