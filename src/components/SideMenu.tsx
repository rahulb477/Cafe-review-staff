"use client";

import React, { useEffect } from "react";
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
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { CafeLogo } from "./Icons";
import { CustomerAvatar } from "./ui/CustomerAvatar";

/**
 * Staff side menu (screen 12).
 *
 * The business shown here is the single one resolved from
 * staffUsers/{uid}.clientId → clients/{clientId}. There is deliberately NO
 * tenant/business switcher of any kind: one staff account belongs to one
 * business and it can never be changed from the browser.
 */
export function SideMenu() {
  const { isDrawerOpen, setIsDrawerOpen, client, staffUser, clientId, logout } = useStaffApp();
  const pathname = usePathname();

  useEffect(() => {
    if (!isDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen, setIsDrawerOpen]);

  if (!isDrawerOpen) return null;

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
    <div className="fixed inset-0 z-50 flex" role="presentation">
      <div
        className="animate-fade-in absolute inset-0 bg-espresso-950/55"
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Staff menu"
        className={cn(
          "animate-slide-left relative z-10 flex h-full w-[min(19rem,86vw)] flex-col",
          "border-r border-line bg-cream-100 shadow-sheet"
        )}
      >
        {/* Header: café identity + staff identity + close */}
        <div className="pt-safe border-b border-line bg-espresso-800 cafe-motif">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-4">
            <div className="flex min-w-0 items-center gap-2.5">
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

            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              aria-label="Close menu"
              className="press-scale -mt-0.5 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-cream-200/80 hover:bg-cream-50/10 hover:text-cream-50"
            >
              <X className="size-4.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-3 border-t border-cream-50/10 bg-espresso-900/40 px-4 py-3.5">
            <CustomerAvatar
              name={staffName}
              tint="#4e2a14"
              size="md"
              className="text-caramel-300"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.86rem] font-bold leading-tight text-cream-50">
                {staffName}
              </p>
              <p className="mt-0.5 truncate text-[0.68rem] font-semibold text-caramel-300/90">
                {staffRole}
              </p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3.5">
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
                    onClick={() => setIsDrawerOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "press-scale flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.84rem] font-semibold",
                      active
                        ? "bg-espresso-800 text-cream-50 shadow-card"
                        : "text-espresso-700 hover:bg-sand-100"
                    )}
                  >
                    <Icon
                      className={cn("size-[1.15rem] shrink-0", active ? "text-caramel-300" : "text-espresso-400")}
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

        {/* Divider + Sign Out */}
        <div className="border-t border-line bg-cream-200/60 px-3 py-3.5 cta-safe-bottom">
          <button
            type="button"
            onClick={() => {
              setIsDrawerOpen(false);
              void logout();
            }}
            className={cn(
              "press-scale flex w-full items-center justify-center gap-2 rounded-lg",
              "border border-alert-100 bg-alert-50 px-4 py-2.5 text-[0.8rem] font-bold text-alert-700",
              "hover:bg-alert-100"
            )}
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
          <p className="mt-2 text-center text-[0.62rem] font-medium text-espresso-300">
            Secure staff access · {clientName}
          </p>
        </div>
      </aside>
    </div>
  );
}
