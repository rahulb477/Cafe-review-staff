"use client";

import React, { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { Gift, QrCode, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  toStaffServiceError,
} from "@/services/staffErrors";
import type { CustomerProfile } from "@/services/types";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeading } from "@/components/ui/Card";
import { CustomerCard } from "@/components/ui/CustomerCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

type FilterTab = "all" | "reward_ready";

/**
 * Screen 9 — Customer Lookup.
 *
 * The directory is always read through FirebaseService.getCustomers(), which
 * pins `clientId` in the Firestore query itself, so customers belonging to
 * another business can never be listed. Nothing here is hardcoded.
 */
export default function CustomerLookupPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const { clientId } = useStaffApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const fetchCustomers = useCallback(async (term: string) => {
    setIsLoading(true);
    try {
      const list = await FirebaseService.getCustomers({ search: term });
      setCustomers(list);
      setErrorMessage(null);
    } catch (error: unknown) {
      const staffErr = toStaffServiceError(error);
      console.error("[customers] lookup failed:", describeErrorForDiagnostics(staffErr));
      setCustomers([]);
      setErrorMessage(staffErr.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search — one Firestore query per settled term, not per keystroke.
  useEffect(() => {
    if (!clientId) return;
    const handle = window.setTimeout(() => {
      void fetchCustomers(searchQuery);
    }, searchQuery ? 300 : 0);
    return () => window.clearTimeout(handle);
  }, [clientId, fetchCustomers, searchQuery]);

  const visibleCustomers = customers.filter((customer) => {
    if (activeTab === "reward_ready") {
      return customer.isEligibleForReward || customer.stamps >= customer.stampTarget;
    }
    return true;
  });

  const rewardReadyCount = customers.filter(
    (customer) => customer.isEligibleForReward || customer.stamps >= customer.stampTarget
  ).length;

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <ScreenHeader title="Customer Lookup" backHref={`/staff/${clientSlug}`} />

      {/* Search + QR shortcut */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-espresso-300">
            <Search className="size-4" aria-hidden="true" />
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by customer ID…"
            aria-label="Search customers by ID, name or phone"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              "h-12 w-full rounded-lg border border-line bg-cream-50 pl-10 pr-10",
              "text-base font-medium text-espresso-900 placeholder-espresso-300 shadow-hairline",
              "focus:border-espresso-300 focus:outline-none focus:ring-2 focus:ring-espresso-800/15",
              "sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="press-scale absolute inset-y-0 right-0 flex items-center pr-3.5 text-espresso-300 hover:text-espresso-700"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <Link
          href={`/staff/${clientSlug}/scan`}
          aria-label="Scan a customer QR code"
          className={cn(
            "press-scale flex size-12 shrink-0 items-center justify-center rounded-lg",
            "bg-espresso-800 text-caramel-300 shadow-card hover:bg-espresso-700"
          )}
        >
          <QrCode className="size-5" aria-hidden="true" />
        </Link>
      </div>

      {/* Filters */}
      <div className="scrollbar-none -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          aria-pressed={activeTab === "all"}
          className={cn(
            "press-scale shrink-0 rounded-full border px-3.5 py-1.5 text-[0.74rem] font-bold",
            activeTab === "all"
              ? "border-espresso-800 bg-espresso-800 text-cream-50 shadow-hairline"
              : "border-line bg-cream-50 text-espresso-500 hover:bg-sand-100"
          )}
        >
          All Customers{!isLoading && ` (${customers.length})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reward_ready")}
          aria-pressed={activeTab === "reward_ready"}
          className={cn(
            "press-scale flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.74rem] font-bold",
            activeTab === "reward_ready"
              ? "border-leaf-600 bg-leaf-600 text-cream-50 shadow-hairline"
              : "border-leaf-200 bg-leaf-50 text-leaf-700 hover:bg-leaf-100"
          )}
        >
          <Gift className="size-3.5" aria-hidden="true" />
          Reward Ready{!isLoading && ` (${rewardReadyCount})`}
        </button>
      </div>

      <SectionHeading
        title={searchQuery ? "Results" : "Recent Customers"}
        action={
          !isLoading && !errorMessage ? (
            <span className="text-[0.7rem] font-semibold text-espresso-300 tabular-nums">
              {visibleCustomers.length} shown
            </span>
          ) : undefined
        }
      />

      {/* Directory */}
      {errorMessage ? (
        <ErrorState
          message={errorMessage}
          title="Customer lookup failed"
          onRetry={() => void fetchCustomers(searchQuery)}
        />
      ) : isLoading ? (
        <LoadingState rows={4} label="Loading customers…" />
      ) : visibleCustomers.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={
            searchQuery
              ? `No customers match “${searchQuery}”`
              : activeTab === "reward_ready"
                ? "No rewards ready"
                : "No customers yet"
          }
          message={
            searchQuery
              ? "Check the spelling, or clear the search to see the full directory."
              : activeTab === "reward_ready"
                ? "Customers who complete every stamp will appear here."
                : "Customers appear here once they register with this business."
          }
          action={
            searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="press-scale rounded-md border border-line bg-cream-100 px-3 py-1.5 text-[0.74rem] font-bold text-espresso-700 hover:bg-sand-100"
              >
                Clear search
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {visibleCustomers.map((customer) => (
            <li key={customer.id}>
              <CustomerCard
                customer={customer}
                href={`/staff/${clientSlug}/customers/${customer.id}`}
                activityMillis={customer.lastActivityMillis}
                activityFallback={`${customer.totalVisits} ${
                  customer.totalVisits === 1 ? "visit" : "visits"
                }`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
