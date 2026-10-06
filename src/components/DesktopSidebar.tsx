"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gauge,
  Gift,
  History,
  LogOut,
  QrCode,
  Search,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { CafeLogo } from "./Icons";
import { CustomerAvatar } from "./ui/CustomerAvatar";

/**
 * Tablet/desktop rail. Mirrors the mobile Side Menu exactly (same items, same
 * espresso active state) and, like it, resolves the single assigned business
 * from staffUsers/{uid}.clientId — there is no business switcher anywhere.
 */
export function DesktopSidebar() {
  const pathname = usePathname();
  const { client, staffUser, clientId, logout } = useStaffApp();

  const clientSlug = clientId || staffUser?.clientId || client?.slug || "";
  const clientName = client?.name || "Staff Portal";
  const clientTagline = client?.tagline || "Loyalty Programme";
  const staffName = staffUser?.name || "Staff Member";
  const staffRole = staffUser?.role || "Staff Member";

  const navItems = [
    { label: "Dashboard", href: `/staff/${clientSlug}`, icon: Gauge, exact: true },
    { label: "Scan QR", href: `/staff/${clientSlug}/scan`, icon: QrCode },
    { label: "Customer Lookup", href: `/staff/${clientSlug}/customers`, icon: Search },
    { label: "Recent Activity", href: `/staff/${clientSlug}/activity`, icon: History },
    { label: "Rewards", href: `/staff/${clientSlug}/rewards`, icon: Gift },
    { label: "Settings", href: `/staff/${clientSlug}/settings`, icon: Settings },
  ];

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line",
        "bg-cream-100 shadow-hairline md:flex lg:w-72"
      )}
    >
      <div className="pt-safe border-b border-espresso-900 bg-espresso-800 cafe-motif px-4 py-4">
        <div className="flex items-center gap-2.5">
          <CafeLogo
            name={clientName}
            logoUrl={client?.logoUrl}
            logoText={client?.logoText}
            inverse
            className="size-10 shrink-0"
          />
          <div className="min-w-0">
            <p className="truncate text-[0.92rem] font-extrabold leading-tight text-cream-50">
              {clientName}
            </p>
            <p className="mt-0.5 truncate text-[0.6rem] font-bold uppercase tracking-[0.12em] text-caramel-300">
              {clientTagline}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-line bg-cream-200/60 px-4 py-3.5">
        <CustomerAvatar name={staffName} tint="#e7d8c5" size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.84rem] font-bold leading-tight text-espresso-900">
            {staffName}
          </p>
          <p className="mt-0.5 truncate text-[0.68rem] font-semibold text-espresso-400">
            {staffRole}
          </p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-espresso-300">
          Staff Console
        </p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || Boolean(pathname?.startsWith(`${item.href}/`));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press-scale flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.84rem] font-semibold",
                    active
                      ? "bg-espresso-800 text-cream-50 shadow-card"
                      : "text-espresso-700 hover:bg-sand-100"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[1.15rem] shrink-0",
                      active ? "text-caramel-300" : "text-espresso-400"
                    )}
                    strokeWidth={active ? 2.3 : 2}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line bg-cream-200/60 px-3 py-3.5">
        <button
          type="button"
          onClick={() => void logout()}
          className={cn(
            "press-scale flex w-full items-center justify-center gap-2 rounded-lg",
            "border border-alert-100 bg-alert-50 px-4 py-2.5 text-[0.78rem] font-bold text-alert-700",
            "hover:bg-alert-100"
          )}
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
