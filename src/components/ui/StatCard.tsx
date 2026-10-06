"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

export type StatTone = "clay" | "leaf" | "caramel" | "espresso";

const TONES: Record<StatTone, string> = {
  clay: "bg-clay-50 text-clay-600",
  leaf: "bg-leaf-50 text-leaf-600",
  caramel: "bg-caramel-100 text-caramel-600",
  espresso: "bg-espresso-50 text-espresso-700",
};

export interface StatCardProps {
  label: string;
  /** Rendered value; a number, or "—" when the metric could not be read. */
  value: number | string;
  icon: LucideIcon;
  tone?: StatTone;
  /** Small secondary line, e.g. "new today". */
  caption?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Dashboard metric card. Values are always Firebase-derived; when a metric
 * cannot be read the caller passes "—" so a failure is never shown as a zero.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "espresso",
  caption,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <Card radius="xl" className={cn("p-3.5 sm:p-4", className)}>
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
          TONES[tone]
        )}
        aria-hidden="true"
      >
        <Icon className="size-[1.15rem]" strokeWidth={2.1} />
      </span>

      <div className="mt-3">
        {loading ? (
          <span className="skeleton block h-7 w-12 rounded-md" aria-hidden="true" />
        ) : (
          <span className="block text-[1.7rem] font-extrabold leading-none tracking-tight tabular-nums text-espresso-900">
            {value}
          </span>
        )}
        <span className="mt-1.5 block truncate text-[0.72rem] font-bold text-espresso-700">
          {label}
        </span>
        {caption && (
          <span className="mt-0.5 block truncate text-[0.66rem] font-medium text-espresso-300">
            {caption}
          </span>
        )}
      </div>
    </Card>
  );
}
