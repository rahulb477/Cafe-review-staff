"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  className?: string;
}

/**
 * Bottom-sheet primitive (centre dialog from `sm` up). Used by the manual
 * stamp picker so it shares the exact overlay, radius and safe-area treatment
 * with ConfirmModal.
 */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  closeOnBackdrop = true,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = `sheet-${title.replace(/\W+/g, "-").toLowerCase()}`;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("button, a, input")?.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade-in absolute inset-0 bg-espresso-950/55"
        onClick={() => closeOnBackdrop && onClose()}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-sheet-up relative z-10 flex max-h-[92dvh] w-full flex-col",
          "rounded-t-3xl border border-line bg-cream-50 shadow-sheet sm:max-w-md sm:rounded-3xl",
          className
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-[1rem] font-extrabold text-espresso-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-[0.74rem] font-medium text-espresso-400">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press-scale -mt-0.5 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-espresso-400 hover:bg-sand-100 hover:text-espresso-800"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>

        {footer && (
          <div className="cta-safe-bottom border-t border-line-soft bg-cream-100/70 px-5 pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
