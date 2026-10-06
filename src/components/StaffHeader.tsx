"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import type { StaffNotification } from "@/services/types";
import { CafeLogo } from "./Icons";
import { CustomerAvatar } from "./ui/CustomerAvatar";
import { NotificationItem } from "./ui/NotificationItem";
import { LoadingState } from "./ui/LoadingState";
import { ErrorState } from "./ui/ErrorState";
import { EmptyState } from "./ui/EmptyState";

/**
 * App header (screen 2). Business name, logo and tagline are always read from
 * clients/{clientId} via the staff session — never hardcoded, never selectable.
 *
 * The bell opens the live notification sheet backed by
 * clients/{clientId}/notifications/{notificationId}; the unread badge and the
 * mark-as-read write both go to Firestore.
 */
export function StaffHeader() {
  const { client, staffUser, clientId, setIsDrawerOpen } = useStaffApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const clientSlug = clientId || staffUser?.clientId || client?.slug || "";
  const clientName = client?.name || "Staff Portal";
  const clientTagline = client?.tagline || "Loyalty Programme";
  const staffName = staffUser?.name || "Staff Member";
  const staffRole = staffUser?.role || "Staff Member";

  // Real-time listener scoped to the authenticated staff member's business.
  useEffect(() => {
    if (!clientId) return;

    let active = true;

    const unsubscribe = FirebaseService.listenToNotifications(
      (items) => {
        if (!active) return;
        setNotifications(items);
        setNotificationsError(null);
        setNotificationsLoading(false);
      },
      (error) => {
        if (!active) return;
        setNotifications([]);
        setNotificationsError(error.message);
        setNotificationsLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [clientId]);

  // Close the sheet on outside tap / Escape.
  useEffect(() => {
    if (!showNotifications) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowNotifications(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showNotifications]);

  const unreadCount = notifications.filter((item) => !item.read).length;

  const handleNotificationClick = async (notification: StaffNotification) => {
    if (notification.read) return;
    // Optimistic; a failed write is tolerated and the listener re-syncs.
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
    );
    try {
      await FirebaseService.markNotificationRead(notification.id);
    } catch (error: unknown) {
      console.warn("[staff-notifications] mark read notice:", error);
    }
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 border-b border-line bg-cream-100/95 backdrop-blur-md",
          "pt-safe shadow-hairline"
        )}
      >
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href={`/staff/${clientSlug}`}
            className="press-scale flex min-w-0 items-center gap-2.5"
            aria-label={`${clientName} dashboard`}
          >
            <CafeLogo
              name={clientName}
              logoUrl={client?.logoUrl}
              logoText={client?.logoText}
              className="size-9 shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate text-[0.9rem] font-extrabold leading-tight tracking-tight text-espresso-900">
                {clientName}
              </span>
              <span className="mt-0.5 block truncate text-[0.62rem] font-bold uppercase tracking-[0.11em] text-espresso-400">
                {clientTagline}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <div className="relative" ref={panelRef}>
              <button
                type="button"
                onClick={() => setShowNotifications((open) => !open)}
                aria-label={
                  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
                }
                aria-expanded={showNotifications}
                className={cn(
                  "press-scale relative inline-flex size-10 items-center justify-center rounded-full",
                  "border border-line bg-cream-50 text-espresso-700 shadow-hairline",
                  "hover:bg-sand-100",
                  showNotifications && "bg-sand-100"
                )}
              >
                <Bell className="size-[1.15rem]" strokeWidth={2} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full border-2 border-cream-100 bg-caramel-500 px-1 text-[0.58rem] font-extrabold text-cream-50 tabular-nums">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div
                  role="dialog"
                  aria-label="Staff notifications"
                  className={cn(
                    "animate-rise z-50 overflow-hidden rounded-xl border border-line bg-cream-50 shadow-raise",
                    // Mobile: a fixed sheet under the header, inset from both
                    // edges so it can never overflow a 320px viewport.
                    "fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+4.25rem)]",
                    // From sm up: a dropdown anchored to the bell.
                    "sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[20rem]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-line-soft bg-cream-100 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.8rem] font-bold text-espresso-900">
                        Notifications
                      </p>
                      <p className="truncate text-[0.66rem] font-medium text-espresso-400">
                        {unreadCount > 0
                          ? `${unreadCount} unread · ${clientName}`
                          : `All caught up · ${clientName}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      aria-label="Close notifications"
                      className="press-scale inline-flex size-7 shrink-0 items-center justify-center rounded-full text-espresso-400 hover:bg-sand-100 hover:text-espresso-800"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="max-h-[19rem] overflow-y-auto overscroll-contain p-1.5">
                    {notificationsLoading ? (
                      <LoadingState compact label="Loading notifications…" />
                    ) : notificationsError ? (
                      <ErrorState inline message={notificationsError} className="m-1.5" />
                    ) : notifications.length === 0 ? (
                      <EmptyState
                        bare
                        icon={<Bell />}
                        title="No notifications yet"
                        message="Stamps, unlocks and redemptions for this business will appear here."
                      />
                    ) : (
                      <ul className="space-y-0.5">
                        {notifications.map((notification) => (
                          <NotificationItem
                            key={notification.id}
                            notification={notification}
                            onSelect={(item) => void handleNotificationClick(item)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open staff menu"
              aria-haspopup="dialog"
              className={cn(
                "press-scale flex items-center gap-2 rounded-full border border-line bg-cream-50",
                "py-1 pr-2.5 pl-1 shadow-hairline hover:bg-sand-100"
              )}
            >
              <CustomerAvatar name={staffName} tint="#e7d8c5" size="sm" />
              <span className="hidden min-w-0 text-left xs:block">
                <span className="flex items-center gap-0.5">
                  <span className="max-w-[7.5rem] truncate text-[0.74rem] font-bold leading-none text-espresso-900">
                    {staffName}
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-espresso-400" aria-hidden="true" />
                </span>
                <span className="mt-1 block truncate text-[0.62rem] font-semibold leading-none text-espresso-400">
                  {staffRole}
                </span>
              </span>
              <span className="xs:hidden">
                <ChevronDown className="size-3.5 text-espresso-400" aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
