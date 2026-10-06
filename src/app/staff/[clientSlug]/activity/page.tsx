"use client";

import React, { useEffect, useMemo, useState, use } from "react";
import { ChevronDown, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  toStaffServiceError,
} from "@/services/staffErrors";
import type { StaffActivityItem } from "@/services/types";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { ActivityItem } from "@/components/ui/ActivityItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

const FILTERS = [
  { value: "all", label: "All Activity" },
  { value: "stamps", label: "Stamps" },
  { value: "rewards", label: "Rewards" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

/**
 * Screen 11 — Recent Activity.
 *
 * A live Firestore listener over clients/{clientId}/stampTransactions, ordered
 * newest first and scoped to the authenticated staff member's business. No
 * demo rows exist: an empty ledger renders the empty state.
 */
export default function RecentActivityPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const { client, clientId } = useStaffApp();

  const [activities, setActivities] = useState<StaffActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    if (!clientId) return;
    let active = true;

    const unsubscribe = FirebaseService.listenToRecentActivity(
      (liveItems) => {
        if (!active) return;
        // Newest first — the ledger listener already orders by createdAt desc.
        setActivities(
          [...liveItems].sort(
            (a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || "")
          )
        );
        setErrorMessage(null);
        setIsLoading(false);
      },
      (error) => {
        if (!active) return;
        console.warn("[activity] listener notice:", describeErrorForDiagnostics(error));
        setErrorMessage(toStaffServiceError(error).message);
        setIsLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [clientId]);

  const visibleActivities = useMemo(() => {
    if (filter === "stamps") return activities.filter((item) => item.activityType === "STAMP_ADDED");
    if (filter === "rewards") {
      return activities.filter((item) => item.activityType === "REWARD_REDEEMED");
    }
    return activities;
  }, [activities, filter]);

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <ScreenHeader title="Recent Activity" backHref={`/staff/${clientSlug}`} />

      {/* Filter dropdown */}
      <div className="relative">
        <label htmlFor="activity-filter" className="sr-only">
          Filter activity
        </label>
        <select
          id="activity-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as FilterValue)}
          className={cn(
            "h-11 w-full appearance-none rounded-lg border border-line bg-cream-50 pl-3.5 pr-10",
            "text-[0.82rem] font-bold text-espresso-800 shadow-hairline",
            "focus:border-espresso-300 focus:outline-none focus:ring-2 focus:ring-espresso-800/15"
          )}
        >
          {FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-espresso-400"
          aria-hidden="true"
        />
      </div>

      {/* Timeline */}
      <Card radius="xl" className="p-4 sm:p-5">
        {isLoading ? (
          <LoadingState label="Loading activity…" />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} title="Activity unavailable" />
        ) : visibleActivities.length === 0 ? (
          <EmptyState
            bare
            className="py-8"
            icon={<Clock />}
            title="No activity recorded"
            message={
              filter === "all"
                ? `Stamps added and rewards redeemed at ${client?.name ?? "this business"} appear here in real time.`
                : "Nothing matches this filter yet."
            }
          />
        ) : (
          <ul className="relative">
            {visibleActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                timeline
                customerHref={
                  activity.customerId
                    ? `/staff/${clientSlug}/customers/${activity.customerId}`
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-cream-200/60 px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.7rem] font-semibold text-espresso-500">
          <ShieldCheck className="size-3.5 shrink-0 text-leaf-600" aria-hidden="true" />
          <span className="truncate">Scoped to your assigned business</span>
        </span>
        <span className="shrink-0 text-[0.7rem] font-bold text-espresso-700">
          {client?.name || "—"}
        </span>
      </div>
    </div>
  );
}
