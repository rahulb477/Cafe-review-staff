"use client";

import React from "react";
import { CheckCircle2, Gift } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";
import { CoffeeCupIllustration } from "@/components/Icons";

export interface RewardCardProps {
  rewardName: string;
  status: string;
  description?: string;
  /** Optional image URL from clients/{clientId}.loyalty.rewardImage. */
  imageUrl?: string | null;
  /** Positive/green treatment when the reward is unlocked and redeemable. */
  ready?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Reward tile used on Reward Unlocked (screen 7), Redeem Reward (screen 8)
 * and inside Customer Details when a reward is available.
 */
export function RewardCard({
  rewardName,
  status,
  description,
  imageUrl,
  ready = false,
  size = "md",
  className,
}: RewardCardProps) {
  return (
    <Card
      radius="xl"
      className={cn(
        "flex items-center gap-3.5 text-left",
        size === "md" ? "p-4" : "p-3",
        ready ? "border-leaf-200 bg-leaf-50" : "border-caramel-200/70 bg-caramel-100/40",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-cream-50",
          size === "md" ? "size-14" : "size-11"
        )}
        aria-hidden="true"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <CoffeeCupIllustration className={size === "md" ? "size-11" : "size-8"} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem] font-extrabold text-espresso-900">
          {rewardName}
        </span>
        <span
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[0.72rem] font-semibold",
            ready ? "text-leaf-700" : "text-caramel-600"
          )}
        >
          {ready ? (
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Gift className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{status}</span>
        </span>
        {description && (
          <span className="mt-1 block text-[0.72rem] font-medium leading-snug text-espresso-400">
            {description}
          </span>
        )}
      </span>
    </Card>
  );
}
