"use client";

import React from "react";
import Link from "next/link";
import { Coffee, Gift, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StaffActivityItem } from "@/services/types";

const KIND_STYLES = {
  stamp: { tile: "bg-clay-50 text-clay-600", badge: "bg-leaf-100 text-leaf-700" },
  reward: { tile: "bg-caramel-100 text-caramel-600", badge: "bg-caramel-100 text-caramel-600" },
  customer: { tile: "bg-leaf-50 text-leaf-600", badge: "bg-leaf-100 text-leaf-700" },
} as const;

export type ActivityKind = keyof typeof KIND_STYLES;

export interface ActivityItemProps {
  activity: StaffActivityItem;
  /** Timeline treatment (connecting rail + node) used by Recent Activity. */
  timeline?: boolean;
  /** Compact row used by the dashboard "Today's Activity" preview. */
  compact?: boolean;
  customerHref?: string;
  className?: string;
}

function kindOf(activity: StaffActivityItem): ActivityKind {
  if (activity.activityType === "REWARD_REDEEMED") return "reward";
  if (activity.activityType === "NEW_CUSTOMER") return "customer";
  return "stamp";
}

function KindIcon({ kind, className }: { kind: ActivityKind; className?: string }) {
  if (kind === "reward") return <Gift className={className} aria-hidden="true" />;
  if (kind === "customer") return <UserPlus className={className} aria-hidden="true" />;
  return <Coffee className={className} aria-hidden="true" />;
}

/**
 * One activity row built from a real ledger document
 * (clients/{clientId}/stampTransactions or rewardRedemptions).
 */
export function ActivityItem({
  activity,
  timeline = false,
  compact = false,
  customerHref,
  className,
}: ActivityItemProps) {
  const kind = kindOf(activity);
  const styles = KIND_STYLES[kind];

  const details = (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[0.84rem] font-bold text-espresso-900">
          {activity.title}
        </span>
        <span className="shrink-0 text-[0.68rem] font-semibold tabular-nums text-espresso-300">
          {activity.timeFormatted || "—"}
        </span>
      </span>

      <span className="mt-0.5 block truncate text-[0.74rem] font-medium text-espresso-500">
        {[activity.customerName, activity.customerCode && `#${activity.customerCode}`]
          .filter(Boolean)
          .join(" · ") || activity.description}
      </span>

      {!compact && (
        <span className="mt-0.5 block truncate text-[0.68rem] font-medium text-espresso-300">
          by {activity.staffName || "—"}
        </span>
      )}

      {!compact && activity.transactionId && (
        <span className="mt-0.5 block truncate text-[0.64rem] font-medium text-espresso-300">
          Transaction ID: {activity.transactionId}
        </span>
      )}
    </span>
  );

  const badge = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] font-extrabold",
        styles.badge
      )}
    >
      {kind === "stamp" ? (
        "+1"
      ) : (
        <>
          <Gift className="size-3" aria-hidden="true" />
          {kind === "reward" ? "Redeemed" : "New"}
        </>
      )}
    </span>
  );

  const node = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 border-cream-50",
        compact ? "size-9" : "size-10",
        styles.tile
      )}
      aria-hidden="true"
    >
      <KindIcon kind={kind} className="size-[1.05rem]" />
    </span>
  );

  if (timeline) {
    return (
      <li className={cn("relative flex gap-3 pb-5 last:pb-0", className)}>
        <span className="absolute top-10 bottom-0 left-5 w-px bg-line" aria-hidden="true" />
        {node}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-2">{details}</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {customerHref && activity.customerId ? (
              <Link
                href={customerHref}
                className="press-scale text-[0.7rem] font-bold text-espresso-500 underline-offset-2 hover:text-espresso-800 hover:underline"
              >
                View customer
              </Link>
            ) : (
              <span />
            )}
            {badge}
          </div>
        </div>
      </li>
    );
  }

  const rowClasses = cn(
    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-cream-200/60",
    className
  );

  return (
    <li>
      {customerHref && activity.customerId ? (
        <Link href={customerHref} className={cn(rowClasses, "press-scale")}>
          {node}
          {details}
          {badge}
        </Link>
      ) : (
        <div className={rowClasses}>
          {node}
          {details}
          {badge}
        </div>
      )}
    </li>
  );
}
