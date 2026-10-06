"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffApp } from "@/context/StaffAppContext";
import { BakedLogoIcon } from "./Icons";
import {
  Gift,
  History,
  Home,
  LogOut,
  QrCode,
  Search,
  Settings,
  X,
} from "lucide-react";

export function StaffDrawer() {
  const { isDrawerOpen, setIsDrawerOpen, client, staffUser, logout } = useStaffApp();
  const pathname = usePathname();

  if (!isDrawerOpen) return null;

  const clientSlug = staffUser?.clientId || client?.slug || "";
  const clientName = client?.name || "Staff Portal";
  const clientTagline = client?.tagline || "FIREBASE STAFF CONSOLE";
  const staffName = staffUser?.name || "Staff Member";
  const staffRole = staffUser?.role || "Staff Member";

  const navItems = [
    { label: "Dashboard", href: `/staff/${clientSlug}`, icon: Home },
    { label: "Scan QR", href: `/staff/${clientSlug}/scan`, icon: QrCode },
    { label: "Customer Lookup", href: `/staff/${clientSlug}/customers`, icon: Search },
    { label: "Recent Activity", href: `/staff/${clientSlug}/activity`, icon: History },
    { label: "Rewards", href: `/staff/${clientSlug}/rewards`, icon: Gift },
    { label: "Settings", href: `/staff/${clientSlug}/settings`, icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={() => setIsDrawerOpen(false)}
      />

      <div className="relative z-10 w-full max-w-xs sm:max-w-sm bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-250">
        <div className="bg-[#3A1E0D] px-5 py-5 text-white flex items-center justify-between border-b border-[#2A1408]">
          <div className="flex items-center gap-3">
            <BakedLogoIcon className="w-9 h-9 ring-2 ring-[#E6B875]/40" />
            <div>
              <div className="font-extrabold text-base tracking-wide text-white leading-tight">
                {clientName}
              </div>
              <div className="text-[10px] font-semibold tracking-wider text-[#D4A373] uppercase">
                {clientTagline}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-stone-100 bg-[#FAF7F2]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#4A2810] text-[#E6B875] font-bold text-lg flex items-center justify-center shadow-inner border border-[#C58940]/40">
              {staffName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-[#3A1E0D] truncate">{staffName}</h3>
              <p className="text-xs text-stone-500 font-medium">{staffRole}</p>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Firebase session active
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsDrawerOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[#3A1E0D] text-white"
                    : "text-stone-700 hover:bg-[#F3E7DC] hover:text-[#3A1E0D]"
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? "text-[#E6B875]" : "text-stone-500"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-200 bg-stone-50">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold text-sm transition-colors border border-red-200/60"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
          <p className="text-center text-[10px] text-stone-400 mt-2">
            Staff App v1.0.0 • Secure
          </p>
        </div>
      </div>
    </div>
  );
}
