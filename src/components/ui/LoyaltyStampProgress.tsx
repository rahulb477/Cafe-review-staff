"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { loyaltyProgressPercent, stampsRemainingCopy, stampFraction } from "@/lib/format";
import { StampSlot, type StampSlotSize } from "./StampSlot";

export interface LoyaltyStampProgressProps {
  stamps: number;
  stampTarget: number;
  rewardName: string;
  /** Heading row ("Loyalty Stamps" + "3 / 8"). */
  showHeading?: boolean;
  /** Thin progress bar under the slots. */
  showProgress?: boolean;
  /** "5 more stamps for Free Coffee" line. */
  showRemaining?: boolean;
  size?: StampSlotSize;
  /** Compact single-row wrap used inside success/reward screens. */
  dense?: boolean;
  className?: string;
}

function gridColumns(target: number, dense: boolean): string {
  if (dense) return "";
  if (target <= 8) return "grid-cols-4 sm:grid-cols-8";
  if (target <= 16) return "grid-cols-5 sm:grid-cols-8";
  return "grid-cols-6 sm:grid-cols-10";
}

/**
 * The loyalty stamp block used by Customer Details (screen 4/10), Stamp Added
 * (screen 6) and Reward Unlocked (screen 7) — one component, one visual.
 */
export function LoyaltyStampProgress({
  stamps,
  stampTarget,
  rewardName,
  showHeading = true,
  showProgress = true,
  showRemaining = true,
  size = "md",
  dense = false,
  className,
}: LoyaltyStampProgressProps) {
  const target = Math.max(0, Math.floor(stampTarget) || 0);
  const collected = Math.max(0, Math.min(target || stamps, Math.floor(stamps) || 0));
  const percent = loyaltyProgressPercent(collected, target);
  const remaining = Math.max(0, target - collected);
  const complete = target > 0 && remaining === 0;

  const slots = Array.from({ length: target }, (_, index) => index);

  return (
    <div className={cn("space-y-3.5", className)}>
      {showHeading && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.82rem] font-bold text-espresso-800">Loyalty Stamps</span>
          <span className="text-base font-extrabold tabular-nums text-espresso-900">
            {stampFraction(collected, target)}
          </span>
        </div>
      )}

      <div
        className={cn(
          dense
            ? "flex flex-wrap items-center justify-center gap-2"
            : cn("grid justify-items-center gap-x-2 gap-y-3", gridColumns(target, dense))
        )}
      >
        {slots.map((index) => (
          <StampSlot
            key={index}
            filled={index < collected}
            isNext={!complete && index === collected}
            index={index + 1}
            size={size}
          />
        ))}
      </div>

      {showProgress && target > 0 && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200"
          role="progressbar"
          aria-valuenow={collected}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-label={`Loyalty progress ${collected} of ${target} stamps`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              complete ? "bg-leaf-600" : "bg-espresso-800"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {showRemaining && (
        <p
          className={cn(
            "text-center text-[0.78rem] font-semibold",
            complete ? "text-leaf-700" : "text-espresso-400"
          )}
        >
          {stampsRemainingCopy(collected, target, rewardName)}
        </p>
      )}
    </div>
  );
}
