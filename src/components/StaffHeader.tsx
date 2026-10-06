"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import { StaffNotification } from "@/services/types";
import { BakedLogoIcon } from "./Icons";
import { Bell, ChevronDown, Gift, Coffee, Cog, X } from "lucide-react";

function NotificationIcon({ type }: { type: StaffNotification["type"] }) {
  if (type === "REWARD_READY" || type === "REWARD_REDEEMED") {
    return <Gift className="w-3.5 h-3.5" />;
  }
  if (type === "STAMP_ADDED") {
    return <Coffee className="w-3.5 h-3.5" />;
  }
  return <Cog className="w-3.5 h-3.5" />;
}

export function StaffHeader() {
  const { client, staffUser, clientId, setIsDrawerOpen } = useStaffApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const clientSlug = clientId || staffUser?.clientId || client?.slug || "";
  const clientName = client?.name || "Staff Portal";
  const clientTagline = client?.tagline || "FIREBASE STAFF CONSOLE";
  const staffName = staffUser?.name || "Staff Member";
  const staffRole = staffUser?.role || "Staff Member";

  // Real Firebase notifications for the authenticated staff member's business.
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

  const unreadCount = notifications.filter((item) => !item.read).length;

  const handleNotificationClick = async (notification: StaffNotification) => {
    if (notification.read) return;
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
      <header className="sticky top-0 z-30 bg-[#FDFBF7]/95 backdrop-blur-md border-b border-[#EBDCCF]/60 px-4 py-3 flex items-center justify-between shadow-xs">
        <Link href={`/staff/${clientSlug}`} className="flex items-center gap-2.5 group">
          <BakedLogoIcon className="w-8 h-8 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-wide text-[#3A1E0D] leading-tight">
              {clientName}
            </span>
            <span className="text-[9px] font-semibold tracking-wider text-[#A0704C] uppercase">
              {clientTagline}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-full text-[#4A2810] hover:bg-[#F3E7DC] transition-colors focus:outline-none focus:ring-2 focus:ring-[#B97B32]/30"
            aria-label={
              unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
            }
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#B97B32] text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-[#F5EBE0] hover:bg-[#ECD8C8] border border-[#DFC8B4] transition-all group focus:outline-none focus:ring-2 focus:ring-[#B97B32]/30"
            aria-label="Open staff menu"
          >
            <div className="w-7 h-7 rounded-full bg-[#3A1E0D] text-[#FDFBF7] font-bold text-xs flex items-center justify-center shadow-xs">
              {staffName.charAt(0)}
            </div>
            <div className="hidden xs:flex flex-col text-left">
              <span className="text-xs font-semibold text-[#3A1E0D] leading-none flex items-center gap-0.5">
                {staffName}
                <ChevronDown className="w-3 h-3 text-[#8C5D3B] group-hover:translate-y-0.5 transition-transform" />
              </span>
              <span className="text-[9px] text-[#8C5D3B] font-medium leading-none mt-0.5">
                {staffRole}
              </span>
            </div>
          </button>
        </div>
      </header>

      {showNotifications && (
        <div
          role="region"
          aria-label="Notifications Panel"
          className="fixed top-14 right-4 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-[#EBDCCF] p-3 animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
            <span className="text-xs font-bold text-[#3A1E0D]">Staff Notifications</span>
            <button
              onClick={() => setShowNotifications(false)}
              className="text-stone-400 hover:text-stone-600 p-1"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {notificationsLoading ? (
            <p className="px-2 py-4 text-center text-xs text-stone-400">Loading notifications...</p>
          ) : notificationsError ? (
            <p className="px-2 py-4 text-center text-xs text-red-600">{notificationsError}</p>
          ) : notifications.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-stone-400">No new notifications.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleNotificationClick(notification)}
                  className={`w-full text-left flex items-start gap-2 rounded-xl px-2 py-2 transition-colors cursor-pointer ${
                    notification.read ? "hover:bg-[#FAF7F2]" : "bg-[#FFF8F0] hover:bg-[#F7EDE2]"
                  }`}
                >
                  <span className="mt-0.5 w-6 h-6 rounded-lg bg-[#FAF3EC] text-[#8C5D3B] flex items-center justify-center shrink-0">
                    <NotificationIcon type={notification.type} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#3A1E0D] truncate">
                        {notification.title}
                      </span>
                      {!notification.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#B97B32] shrink-0" />
                      )}
                    </span>
                    <span className="block text-[11px] text-stone-500 break-words">
                      {notification.message}
                    </span>
                    <span className="block text-[10px] text-stone-400 mt-0.5">
                      {notification.createdAt || "Just now"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
