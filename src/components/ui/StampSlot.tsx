"use client";

import React from "react";
import { cn } from "@/lib/cn";

export type StampSlotSize = "sm" | "md" | "lg";

const SLOT_SIZES: Record<StampSlotSize, string> = {
  sm: "size-7",
  md: "size-9",
  lg: "size-11",
};

const BEAN_SIZES: Record<StampSlotSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

/** Coffee-bean glyph used for a collected stamp. */
export function CoffeeBeanGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="12" rx="7.4" ry="9.2" fill="#D4A373" />
      <path
        d="M12 3.2c-1.9 3.1-1.9 14.5 0 17.6 1.9-3.1 1.9-14.5 0-17.6Z"
        fill="#3A1E0D"
      />
      <path
        d="M11.8 3.4c-2 3.6-2 13.6-.1 17.2"
        stroke="#F7F1E7"
        strokeOpacity="0.45"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export interface StampSlotProps {
  filled: boolean;
  size?: StampSlotSize;
  /** Slot ordinal (1-based) shown inside an empty slot. */
  index?: number;
  /** Highlights the slot that will be filled next. */
  isNext?: boolean;
  className?: string;
}

/**
 * A single loyalty stamp slot — a filled espresso coffee bean for collected
 * stamps, a soft outlined circle for the remaining ones.
 */
export function StampSlot({
  filled,
  size = "md",
  index,
  isNext = false,
  className,
}: StampSlotProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-300",
        SLOT_SIZES[size],
        filled
          ? "bg-espresso-800 shadow-[inset_0_1px_0_rgba(255,253,250,0.18),0_2px_6px_-2px_rgba(58,30,13,0.5)]"
          : isNext
            ? "border-2 border-dashed border-caramel-500/70 bg-caramel-100/60"
            : "border border-dashed border-sand-300 bg-cream-200/50",
        className
      )}
      aria-hidden="true"
    >
      {filled ? (
        <CoffeeBeanGlyph className={BEAN_SIZES[size]} />
      ) : (
        index !== undefined && (
          <span
            className={cn(
              "text-[0.6rem] font-semibold tabular-nums",
              isNext ? "text-caramel-600" : "text-espresso-300"
            )}
          >
            {index}
          </span>
        )
      )}
    </span>
  );
}
