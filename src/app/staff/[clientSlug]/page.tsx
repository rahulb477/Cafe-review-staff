"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  Coffee,
  Gift,
  History,
  Plus,
  QrCode,
  Search,
  Star,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayLabel, greetingForDate, stampFraction } from "@/lib/format";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  toStaffServiceError,
} from "@/services/staffErrors";
import type {
  CustomerProfile,
  DashboardStats,
  StaffActivityItem,
} from "@/services/types";
import { Card, SectionHeading } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { QuickAction } from "@/components/ui/QuickAction";
import { ActivityItem } from "@/components/ui/ActivityItem";
import { CustomerAvatar } from "@/components/ui/CustomerAvatar";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { CoffeeCupIllustration } from "@/components/Icons";

const EMPTY_STATS: DashboardStats = {
  todayStamps: 0,
  todayCustomers: 0,
  todayReviews: 0,
  rewardsRedeemed: 0,
  stampsAvailable: true,
  reviewsAvailable: true,
  customersAvailable: true,
  rewardsAvailable: true,
};

const MANUAL_DIRECTORY_LIMIT = 20;
const TODAY_ACTIVITY_LIMIT = 4;

function isToday(isoTimestamp: string | undefined, today: Date | null): boolean {
  if (!isoTimestamp || !today) return false;
  const millis = Date.parse(isoTimestamp);
  if (Number.isNaN(millis)) return false;
  const stamp = new Date(millis);
  return (
    stamp.getFullYear() === today.getFullYear() &&
    stamp.getMonth() === today.getMonth() &&
    stamp.getDate() === today.getDate()
  );
}

/**
 * Screen 2 — Staff Dashboard.
 *
 * Every number on this screen is a live, business-scoped Firestore value
 * (clients/{clientId}/stampTransactions, customers, reviews,
 * rewardRedemptions). Nothing is hardcoded; an unreadable metric renders "—"
 * and an empty ledger renders an honest empty state.
 */
export default function StaffDashboardPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const { status, session, client, staffUser, clientId, playChime } = useStaffApp();

  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [activities, setActivities] = useState<StaffActivityItem[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(true);

  const [directory, setDirectory] = useState<CustomerProfile[]>([]);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  // Manual stamp flow (dashboard shortcut → the same addStamp write).
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualTarget, setManualTarget] = useState<CustomerProfile | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualMessage, setManualMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null
  );
  const manualStampOperationsRef = useRef<Map<string, string>>(new Map());

  // Resolved after mount (deferred a tick) so the time-aware greeting and the
  // date line can never mismatch the server render, and the effect body never
  // calls setState synchronously.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const handle = window.setTimeout(() => setToday(new Date()), 0);
    return () => window.clearTimeout(handle);
  }, []);

  const staffName = staffUser?.name || "Staff Member";
  const greeting = today ? `${greetingForDate(today)}, ${staffName}.` : "\u00a0";
  const dateLabel = today ? formatDayLabel(today) : "\u00a0";

  const todaysActivity = useMemo(
    () => activities.filter((item) => isToday(item.timestamp, today)).slice(0, TODAY_ACTIVITY_LIMIT),
    [activities, today]
  );

  /* ---------------- live Firestore metrics + activity ---------------- */
  useEffect(() => {
    if (status !== "authorized" || !session?.uid || !clientId) return;
    let active = true;

    const unsubscribeStats = FirebaseService.listenToDashboardStats(
      (liveStats) => {
        if (!active) return;
        setStats(liveStats);
        setIsStatsLoading(false);
        setStatsError(liveStats.errorMessage ?? null);
      },
      (error) => {
        if (!active) return;
        console.warn("[dashboard] stats notice:", describeErrorForDiagnostics(error));
        setStatsError(error.message);
        setIsStatsLoading(false);
      }
    );

    const unsubscribeActivity = FirebaseService.listenToRecentActivity(
      (items) => {
        if (!active) return;
        setActivities(items);
        setIsActivityLoading(false);
      },
      (error) => {
        if (!active) return;
        console.warn("[dashboard] activity notice:", describeErrorForDiagnostics(error));
        setIsActivityLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribeStats();
      unsubscribeActivity();
    };
  }, [status, session?.uid, clientId]);

  /* ---------------- customer directory (manual stamp picker) ---------------- */
  const loadDirectory = useCallback(async () => {
    if (status !== "authorized" || !session?.uid || !clientId) return;
    setIsDirectoryLoading(true);
    try {
      const customers = await FirebaseService.getCustomers({ limit: MANUAL_DIRECTORY_LIMIT });
      setDirectory(customers);
      setDirectoryLoaded(true);
      setDirectoryError(null);
    } catch (error: unknown) {
      const staffError = toStaffServiceError(error);
      console.warn("[dashboard] directory notice:", describeErrorForDiagnostics(staffError));
      setDirectory([]);
      setDirectoryError(staffError.message);
    } finally {
      setIsDirectoryLoading(false);
    }
  }, [status, session?.uid, clientId]);

  /* ---------------- manual stamp ---------------- */
  // The directory is read on demand: opening the picker is the only thing that
  // needs it, so the dashboard never issues a Firestore read it may not use.
  const openManualFlow = () => {
    setManualMessage(null);
    setIsManualOpen(true);
    if (!directoryLoaded || directoryError) void loadDirectory();
  };

  const confirmManualStamp = async () => {
    const target = manualTarget;
    if (!target || !staffUser || isSubmittingManual) return;

    setIsSubmittingManual(true);
    setManualMessage(null);

    try {
      const operationId =
        manualStampOperationsRef.current.get(target.id) ??
        FirebaseService.createIdempotencyKey("stamp");
      manualStampOperationsRef.current.set(target.id, operationId);
      const result = await FirebaseService.addStamp(
        target.id,
        operationId,
        "Manual stamp from dashboard"
      );

      if (result.success) {
        manualStampOperationsRef.current.delete(target.id);
        playChime(result.rewardUnlocked ? "reward" : "stamp");
        setManualMessage({
          tone: "ok",
          text: result.rewardUnlocked
            ? `${target.name} reached ${stampFraction(result.newStamps, result.stampTarget)} — ${result.rewardName} is ready to redeem.`
            : `Stamp added. ${target.name} now has ${stampFraction(result.newStamps, result.stampTarget)} stamps.`,
        });
        await loadDirectory();
        // Let the confirmation be read, then close the picker.
        window.setTimeout(() => {
          setManualMessage(null);
          setIsManualOpen(false);
        }, 1800);
      }
    } catch (error: unknown) {
      const staffError = toStaffServiceError(error);
      console.error("[dashboard] manual stamp failed:", describeErrorForDiagnostics(staffError));
      playChime("error");
      setManualMessage({ tone: "error", text: staffError.message });
    } finally {
      setIsSubmittingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---------------- Greeting ---------------- */}
      <section className="pt-1">
        <h1 className="text-[1.4rem] leading-tight font-extrabold tracking-tight text-espresso-900">
          {greeting}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-[0.76rem] font-semibold text-espresso-400">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>{dateLabel}</span>
          {client?.name && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{client.name}</span>
            </>
          )}
        </p>
      </section>

      {/* ---------------- Main stats ---------------- */}
      <section aria-label="Today's metrics" className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatCard
            label="Today's Stamps"
            caption="since midnight"
            value={stats.stampsAvailable ? stats.todayStamps : "—"}
            icon={Coffee}
            tone="clay"
            loading={isStatsLoading}
          />
          <StatCard
            label="Customers"
            caption="new today"
            value={
              stats.customersAvailable && stats.todayCustomers !== null
                ? stats.todayCustomers
                : "—"
            }
            icon={Users}
            tone="leaf"
            loading={isStatsLoading}
          />
          <StatCard
            label="Reviews"
            caption="total"
            value={stats.reviewsAvailable ? stats.todayReviews : "—"}
            icon={Star}
            tone="caramel"
            loading={isStatsLoading}
          />
          <StatCard
            label="Rewards Redeemed"
            caption="total"
            value={stats.rewardsAvailable ? stats.rewardsRedeemed : "—"}
            icon={Gift}
            tone="espresso"
            loading={isStatsLoading}
          />
        </div>

        {statsError && <ErrorState inline message={statsError} />}
      </section>

      {/* ---------------- Quick actions ---------------- */}
      <section aria-labelledby="quick-actions" className="space-y-2.5">
        <SectionHeading id="quick-actions" title="Quick Actions" />

        <div className="space-y-2.5">
          <QuickAction
            accent
            icon={QrCode}
            title="Scan Customer QR"
            description="Scan a customer's loyalty QR"
            href={`/staff/${clientSlug}/scan`}
          />
          <QuickAction
            icon={Plus}
            title="Add Stamp Manually"
            description="Find a customer and add a stamp"
            onClick={openManualFlow}
          />
          <QuickAction
            icon={Search}
            title="Customer Lookup"
            description="Search existing customers"
            href={`/staff/${clientSlug}/customers`}
          />
          <QuickAction
            icon={History}
            title="Recent Activity"
            description="View today's staff activity"
            href={`/staff/${clientSlug}/activity`}
          />
        </div>
      </section>

      {/* ---------------- Today's activity ---------------- */}
      <section aria-labelledby="todays-activity" className="space-y-2.5">
        <SectionHeading
          id="todays-activity"
          title="Today's Activity"
          action={
            <Link
              href={`/staff/${clientSlug}/activity`}
              className="press-scale inline-flex items-center gap-0.5 text-[0.72rem] font-bold text-espresso-500 hover:text-espresso-800"
            >
              View all
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />

        <Card radius="xl" flush className="overflow-hidden">
          {isActivityLoading ? (
            <LoadingState compact label="Loading today's activity…" />
          ) : todaysActivity.length === 0 ? (
            <EmptyState
              bare
              icon={<Clock />}
              title="No activity yet today"
              message={
                today
                  ? `Stamps and redemptions for ${client?.name ?? "this business"} will appear here as they happen.`
                  : "Stamps and redemptions will appear here as they happen."
              }
            />
          ) : (
            <ul className="divide-y divide-line-soft p-1.5">
              {todaysActivity.map((item) => (
                <ActivityItem
                  key={item.id}
                  activity={item}
                  compact
                  customerHref={
                    item.customerId
                      ? `/staff/${clientSlug}/customers/${item.customerId}`
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ---------------- Manual stamp picker ---------------- */}
      <Sheet
        open={isManualOpen}
        title="Add Stamp Manually"
        subtitle="Select a customer from this business"
        onClose={() => {
          if (isSubmittingManual) return;
          setIsManualOpen(false);
          setManualTarget(null);
        }}
      >
        <div className="space-y-3">
          {manualMessage && (
            <div
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3",
                manualMessage.tone === "ok"
                  ? "border-leaf-200 bg-leaf-50 text-leaf-700"
                  : "border-alert-100 bg-alert-50 text-alert-700"
              )}
            >
              <span className="min-w-0 flex-1 text-[0.76rem] font-semibold leading-relaxed">
                {manualMessage.text}
              </span>
            </div>
          )}

          {directoryError ? (
            <ErrorState inline message={directoryError} onRetry={() => void loadDirectory()} />
          ) : isDirectoryLoading ? (
            <LoadingState rows={3} label="Loading customers…" />
          ) : directory.length === 0 ? (
            <EmptyState
              bare
              icon={<Users />}
              title="No customers yet"
              message="Customers appear here once they register with this business."
              action={
                <Button size="sm" variant="secondary" onClick={() => void loadDirectory()}>
                  Refresh
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {directory.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    disabled={isSubmittingManual}
                    onClick={() => setManualTarget(customer)}
                    className={cn(
                      "press-scale flex w-full items-center gap-3 rounded-lg border border-line",
                      "bg-cream-100 p-3 text-left hover:border-espresso-200 hover:bg-sand-100",
                      "disabled:cursor-not-allowed disabled:opacity-60"
                    )}
                  >
                    <CustomerAvatar name={customer.name} tint={customer.avatarBg} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.85rem] font-bold text-espresso-900">
                        {customer.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.7rem] font-medium text-espresso-300">
                        #{customer.customerCode || customer.id.substring(0, 6)} ·{" "}
                        {stampFraction(customer.stamps, customer.stampTarget)}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-espresso-300" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {/* ---------------- Manual stamp confirmation (screen 5) ---------------- */}
      <ConfirmModal
        open={Boolean(manualTarget)}
        title="Add 1 Loyalty Stamp?"
        description={
          manualTarget ? (
            <>
              This adds one stamp to{" "}
              <span className="font-bold text-espresso-800">{manualTarget.name}</span>&apos;s loyalty
              account.
            </>
          ) : undefined
        }
        hero={<CoffeeCupIllustration className="size-20" />}
        confirmLabel="Confirm"
        submitting={isSubmittingManual}
        onConfirm={() => void confirmManualStamp()}
        onCancel={() => {
          if (isSubmittingManual) return;
          setManualTarget(null);
        }}
      >
        {manualTarget && (
          <div className="rounded-lg border border-line bg-cream-100 p-3">
            <div className="flex items-center justify-between gap-3 text-[0.76rem] font-semibold text-espresso-500">
              <span>Stamp count</span>
              <span className="tabular-nums text-espresso-900">
                {stampFraction(manualTarget.stamps, manualTarget.stampTarget)}
                <ChevronRight className="mx-1 inline size-3 text-espresso-300" aria-hidden="true" />
                <span className="font-extrabold text-leaf-700">
                  {stampFraction(
                    Math.min(manualTarget.stamps + 1, manualTarget.stampTarget),
                    manualTarget.stampTarget
                  )}
                </span>
              </span>
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
