"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { Card } from "./Card";

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Compact inline banner instead of a card. */
  inline?: boolean;
  action?: React.ReactNode;
  className?: string;
}

/**
 * The single error treatment. A real Firestore failure is always surfaced —
 * it is never rendered as a zero, an empty list or a fake record.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Retry",
  inline = false,
  action,
  className,
}: ErrorStateProps) {
  if (inline) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-2.5 rounded-lg border border-alert-100 bg-alert-50 p-3",
          className
        )}
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-alert-600" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[0.76rem] font-semibold leading-relaxed text-alert-700">
          {message}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="press-scale inline-flex shrink-0 items-center gap-1 rounded-md border border-alert-100 bg-cream-50 px-2 py-1 text-[0.66rem] font-bold text-alert-700 hover:bg-alert-50"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            {retryLabel}
          </button>
        )}
        {action}
      </div>
    );
  }

  return (
    <Card radius="xl" className={cn("px-5 py-8 text-center", className)} role="alert">
      <span
        className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-alert-50 text-alert-600"
        aria-hidden="true"
      >
        <AlertCircle className="size-6" />
      </span>
      <h3 className="text-[0.95rem] font-bold text-espresso-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[22rem] text-[0.78rem] font-medium leading-relaxed text-espresso-500">
        {message}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry} iconLeft={<RefreshCw />}>
            {retryLabel}
          </Button>
        )}
        {action}
      </div>
    </Card>
  );
}
