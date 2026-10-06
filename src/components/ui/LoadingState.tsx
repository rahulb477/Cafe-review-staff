"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

export interface LoadingStateProps {
  label?: string;
  /** Skeleton rows instead of a spinner (lists). */
  rows?: number;
  compact?: boolean;
  className?: string;
}

/**
 * The single loading treatment: a spinner for full-screen loads, shimmering
 * skeleton rows for lists. Never renders placeholder data.
 */
export function LoadingState({
  label = "Loading…",
  rows = 0,
  compact = false,
  className,
}: LoadingStateProps) {
  if (rows > 0) {
    return (
      <div className={cn("space-y-2.5", className)} aria-busy="true" aria-live="polite">
        <span className="sr-only">{label}</span>
        {Array.from({ length: rows }, (_, index) => (
          <Card key={index} radius="xl" className="flex items-center gap-3 p-3.5">
            <span className="skeleton size-11 shrink-0 rounded-full" aria-hidden="true" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="skeleton block h-3 w-2/5 rounded-sm" aria-hidden="true" />
              <span className="skeleton block h-2.5 w-3/5 rounded-sm" aria-hidden="true" />
            </span>
            <span className="skeleton block h-7 w-12 shrink-0 rounded-md" aria-hidden="true" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-6" : "gap-3 py-14",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2
        className={cn("animate-spin text-espresso-700", compact ? "size-5" : "size-7")}
        aria-hidden="true"
      />
      <p className={cn("font-medium text-espresso-400", compact ? "text-[0.7rem]" : "text-xs")}>
        {label}
      </p>
    </div>
  );
}
