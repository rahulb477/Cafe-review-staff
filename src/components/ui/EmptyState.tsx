"use client";

import React from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  /** Renders without the card chrome — for use inside an existing panel. */
  bare?: boolean;
  className?: string;
}

/** Honest empty state — shown whenever Firebase returns zero real records. */
export function EmptyState({
  icon,
  title,
  message,
  action,
  bare = false,
  className,
}: EmptyStateProps) {
  const content = (
    <>
      {icon && (
        <span
          className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-sand-100 text-espresso-300 [&>svg]:size-6"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <h3 className="text-[0.92rem] font-bold text-espresso-900">{title}</h3>
      {message && (
        <p className="mx-auto mt-1.5 max-w-[22rem] text-[0.76rem] font-medium leading-relaxed text-espresso-400">
          {message}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </>
  );

  if (bare) {
    return <div className={cn("px-3 py-7 text-center", className)}>{content}</div>;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-cream-50 px-5 py-9 text-center shadow-card",
        className
      )}
    >
      {content}
    </div>
  );
}
