"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Supporting explanation rendered under the title. */
  description?: React.ReactNode;
  /** Visual above the title (coffee/reward illustration, customer pill…). */
  hero?: React.ReactNode;
  /** Any extra structured content (customer card, reward card, counts). */
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Blocks a second submission while the write is in flight. */
  submitting?: boolean;
  confirmVariant?: "primary" | "success" | "danger";
  closeOnBackdrop?: boolean;
  labelledBy?: string;
  className?: string;
}

/**
 * Bottom-sheet style confirmation overlay (screens 5 & 8). The background
 * screen stays mounted and dimmed; the sheet never exceeds the viewport and
 * scrolls internally when the keyboard opens.
 */
export function ConfirmModal({
  open,
  title,
  description,
  hero,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  submitting = false,
  confirmVariant = "primary",
  closeOnBackdrop = true,
  labelledBy,
  className,
}: ConfirmModalProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const titleId = labelledBy ?? `modal-title-${title.replace(/\W+/g, "-").toLowerCase()}`;

  // Escape closes; focus moves into the sheet so it is reachable by keyboard.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTarget = sheetRef.current?.querySelector<HTMLElement>(
      "[data-autofocus], button, a, input"
    );
    focusTarget?.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onCancel, submitting]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-espresso-950/55 animate-fade-in"
        onClick={() => {
          if (closeOnBackdrop && !submitting) onCancel();
        }}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-sheet-up relative z-10 flex max-h-[92dvh] w-full flex-col",
          "rounded-t-3xl border border-line bg-cream-50 shadow-sheet",
          "sm:max-w-sm sm:rounded-3xl",
          className
        )}
      >
        <div className="relative px-5 pt-3.5">
          {/* Mobile grab handle */}
          <span
            className="mx-auto block h-1 w-10 rounded-full bg-sand-300 sm:hidden"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close"
            className="press-scale absolute top-2.5 right-3.5 inline-flex size-8 items-center justify-center rounded-full text-espresso-400 hover:bg-sand-100 hover:text-espresso-800 disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-1">
          {hero && <div className="mb-1 flex justify-center">{hero}</div>}

          <h2
            id={titleId}
            className="text-center text-[1.15rem] font-extrabold leading-snug text-espresso-900"
          >
            {title}
          </h2>

          {description && (
            <p className="mx-auto mt-2 max-w-[22rem] text-center text-[0.8rem] font-medium leading-relaxed text-espresso-500">
              {description}
            </p>
          )}

          {children && <div className="mt-4 space-y-3">{children}</div>}
        </div>

        <div className="cta-safe-bottom mt-4 space-y-2 border-t border-line-soft bg-cream-100/70 px-5 pt-4">
          <Button
            type="button"
            data-autofocus
            variant={confirmVariant}
            size="lg"
            block
            loading={submitting}
            loadingLabel="Working…"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            block
            disabled={submitting}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
