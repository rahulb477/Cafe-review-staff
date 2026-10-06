"use client";

import React from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeTimeFromMillis, stampFraction } from "@/lib/format";
import type { CustomerProfile } from "@/services/types";
import { Card } from "./Card";
import { CustomerAvatar } from "./CustomerAvatar";

export interface CustomerCardProps {
  customer: CustomerProfile;
  href?: string;
  /** Right-hand slot (defaults to the stamp fraction). */
  trailing?: React.ReactNode;
  /** Relative last-activity line, e.g. "2 mins ago". */
  activityMillis?: number;
  /** Replaces the activity line with the total-visit count. */
  activityFallback?: string;
  badge?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Customer list row (Customer Lookup, dashboard previews, Rewards queue).
 * Avatar · name · customer id · stamp fraction · relative last activity.
 */
export function CustomerCard({
  customer,
  href,
  trailing,
  activityMillis,
  activityFallback,
  badge,
  className,
  children,
}: CustomerCardProps) {
  const isRewardReady = customer.isEligibleForReward || customer.stamps >= customer.stampTarget;
  const activity = relativeTimeFromMillis(activityMillis);
  const secondary = activity ?? activityFallback;

  const body = (
    <>
      <CustomerAvatar
        name={customer.name}
        tint={customer.avatarBg}
        size="md"
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[0.88rem] font-bold text-espresso-900">
            {customer.name}
          </span>
          {isRewardReady && !badge && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-xs bg-leaf-100 px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide text-leaf-700">
              <Gift className="size-2.5" aria-hidden="true" />
              Ready
            </span>
          )}
          {badge}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 text-[0.72rem] font-medium text-espresso-300">
          <span className="truncate">#{customer.customerCode || customer.id.substring(0, 6)}</span>
          {secondary && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{secondary}</span>
            </>
          )}
        </span>

        {children}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1">
        {trailing ?? (
          <span
            className={cn(
              "rounded-md px-2 py-1 text-[0.74rem] font-extrabold tabular-nums",
              isRewardReady
                ? "bg-leaf-100 text-leaf-700"
                : "bg-sand-100 text-espresso-800"
            )}
          >
            {stampFraction(customer.stamps, customer.stampTarget)}
          </span>
        )}
      </span>
    </>
  );

  const classes = cn(
    "flex w-full items-center gap-3 p-3.5 text-left press-scale",
    "hover:border-espresso-200 hover:shadow-raise",
    className
  );

  if (href) {
    return (
      <Card radius="xl" flush className={isRewardReady ? "border-leaf-200 bg-leaf-50/45" : undefined}>
        <Link href={href} className={classes}>
          {body}
        </Link>
      </Card>
    );
  }

  return (
    <Card radius="xl" className={classes}>
      {body}
    </Card>
  );
}
