"use client";

import React from "react";
import { useStaffApp } from "@/context/StaffAppContext";
import { BakedLogoIcon } from "./Icons";
import {
  Home,
  QrCode,
  Search,
  History,
  Gift,
  Settings,
  LogOut,
  X,
  Store,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function StaffDrawer() {
  const { isDrawerOpen, setIsDrawerOpen, client, staffUser, logout, switchClient } = useStaffApp();
  const pathname = usePathname();

  if (!isDrawerOpen) return null;

  const clientSlug = client?.slug || "bake";
  const clientName = client?.name || "BAKE";
  const clientTagline = client?.tagline || "CAFÉ & BAKERY";
  const staffName = staffUser?.name || "Amit";
  const staffRole = staffUser?.role || "Staff Member";

  const navItems = [
    { label: "Dashboard", href: `/staff/${clientSlug}`, icon: Home },
    { label: "Scan QR", href: `/staff/${clientSlug}/scan`, icon: QrCode },
    { label: "Customer Lookup", href: `/staff/${clientSlug}/customers`, icon: Search },
    { label: "Recent Activity", href: `/staff/${clientSlug}/activity`, icon: History },
    { label: "Rewards", href: `/staff/${clientSlug}/rewards`, icon: Gift },
    { label: "Settings", href: `/staff/${clientSlug}/settings`, icon: Settings },
  ];

  const clientOptions = [
    { slug: "bake", name: "BAKE Café", target: "8 stamps = Free Coffee" },
    { slug: "sharma-cafe", name: "Sharma Café", target: "10 stamps = Free Pizza" },
    { slug: "royal-restaurant", name: "Royal Restaurant", target: "6 stamps = Chef Dessert" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={() => setIsDrawerOpen(false)}
      />

      {/* Slide-out Drawer matching Screen 12 */}
      <div className="relative z-10 w-full max-w-xs sm:max-w-sm bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-250">
        {/* Top Dark Header */}
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

        {/* Staff Profile Card */}
        <div className="p-4 border-b border-stone-100 bg-[#FAF7F2]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#4A2810] text-[#E6B875] font-bold text-lg flex items-center justify-center shadow-inner border border-[#C58940]/40">
              {staffName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-[#3A1E0D] truncate">{staffName}</h3>
              <p className="text-xs text-stone-500 font-medium">{staffRole}</p>
              <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active on Shift • {staffUser?.staffId || "STAFF-001"}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-stone-400 uppercase">
            Menu Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsDrawerOpen(false)}
                className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[#F3E7DC] text-[#3A1E0D] font-bold shadow-xs"
                    : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? "text-[#3A1E0D]" : "text-stone-500"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#3A1E0D]" />}
              </Link>
            );
          })}

          {/* Multi-Tenant Switcher */}
          <div className="pt-4 mt-2 border-t border-stone-100">
            <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-stone-400 uppercase flex items-center justify-between">
              <span>Switch Client Tenant</span>
              <Store className="w-3.5 h-3.5 text-stone-400" />
            </div>
            <div className="space-y-1 mt-1">
              {clientOptions.map((co) => {
                const isCurrent = co.slug === clientSlug;
                return (
                  <button
                    key={co.slug}
                    onClick={() => switchClient(co.slug)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                      isCurrent
                        ? "bg-[#3A1E0D] text-white font-semibold"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <div>
                      <div className="font-medium">{co.name}</div>
                      <div className={`text-[10px] ${isCurrent ? "text-[#E6B875]" : "text-stone-400"}`}>
                        {co.target}
                      </div>
                    </div>
                    {isCurrent ? (
                      <ShieldCheck className="w-4 h-4 text-[#E6B875]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Sign Out matching Screen 12 */}
        <div className="p-4 border-t border-stone-200 bg-stone-50">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold text-sm transition-colors border border-red-200/60"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
          <p className="text-center text-[10px] text-stone-400 mt-2">
            Multi-Tenant Staff App v1.0.0 • Secure
          </p>
        </div>
      </div>
    </div>
  );
}
