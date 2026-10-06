"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { initialOf } from "@/lib/format";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  xs: "size-7 text-[0.65rem]",
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-14 text-xl",
};

export interface CustomerAvatarProps {
  name?: string;
  /** Warm tint resolved deterministically from the customer id. */
  tint?: string;
  /** Optional photo from Firebase (customers/{id}.photoURL when present). */
  src?: string | null;
  size?: AvatarSize;
  ring?: boolean;
  className?: string;
}

/**
 * Customer/staff avatar. Falls back to the initial on a warm tinted circle —
 * never a random colour, never a stock image.
 */
export function CustomerAvatar({
  name,
  tint = "#f0e2cf",
  src,
  size = "md",
  ring = false,
  className,
}: CustomerAvatarProps) {
  const initial = initialOf(name, "C");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "font-bold text-espresso-800 no-select",
        SIZES[size],
        ring && "ring-2 ring-cream-50",
        className
      )}
      style={{ backgroundColor: tint }}
      aria-hidden="true"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
