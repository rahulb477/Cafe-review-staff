"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  QrCode,
  Plus,
  Search,
  History,
  Users,
  Star,
  Gift,
  Coffee,
  ChevronRight,
  ShieldCheck,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { DashboardStats, CustomerProfile } from "@/services/types";

export default function StaffDashboardPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const { client, staffUser, playChime } = useStaffApp();
  const [stats, setStats] = useState<DashboardStats>({
    todayStamps: 0,
    todayCustomers: 0,
    todayReviews: 0,
    rewardsRedeemed: 0,
  });
  const [recentCustomers, setRecentCustomers] = useState<CustomerProfile[]>([]);

  // Manual stamp modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const staffName = staffUser?.name || "Staff Member";
  const effectiveClientId = staffUser?.clientId || "";

  // Formatted date
  const todayFormatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());

  // Listen for live Firestore dashboard statistics and load customers
  useEffect(() => {
    if (!effectiveClientId) return;

    // 1. Live dashboard stats listener
    const unsubStats = FirebaseService.listenToDashboardStats(effectiveClientId, (liveStats) => {
      setStats(liveStats);
    });

    // Load active customers list
    FirebaseService.getCustomers(effectiveClientId)
      .then((custs) => {
        setRecentCustomers(custs.slice(0, 5));
      })
      .catch((e) => console.error("Error loading customers:", e));

    return () => {
      unsubStats();
    };
  }, [effectiveClientId]);

  const handleManualQuickStamp = async (customer: CustomerProfile) => {
    if (!staffUser || isSubmittingManual) return;
    setIsSubmittingManual(true);
    try {
      const res = await FirebaseService.addStamp(
        customer.id,
        undefined,
        "Manual stamp from dashboard"
      );

      if (res.success) {
        playChime(res.rewardUnlocked ? "reward" : "stamp");
        setManualSuccessMsg(`Stamp added to ${customer.name}'s account!`);
        // Refresh customer list
        const updated = await FirebaseService.getCustomers(effectiveClientId);
        setRecentCustomers(updated.slice(0, 5));
        setTimeout(() => {
          setManualSuccessMsg("");
          setShowManualModal(false);
        }, 1500);
      }
    } catch (e: any) {
      console.error(e);
      playChime("error");
      setManualSuccessMsg(e.message || "Failed to add stamp.");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  return (
    <div className="space-y-6 pb-6 select-none">
      {/* Top Greeting & Date (Screen 2) */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#3A1E0D] tracking-tight">
            Staff Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 font-medium mt-0.5">
            Good morning, {staffName}!
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-[#EFE4D6] border border-[#DECDBE] text-[11px] sm:text-xs font-bold text-[#6D4224] shadow-xs">
          {todayFormatted}
        </div>
      </div>

      {/* 4 Stats Cards (Screen 2 2x2 Grid) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Card 1: Today's Stamps */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EBDCCF] shadow-xs flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#3A1E0D]">
              {stats.todayStamps}
            </div>
            <div className="text-[11px] sm:text-xs text-stone-500 font-semibold mt-0.5">
              Today&apos;s Stamps
            </div>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FFEDD5] text-[#C2410C] flex items-center justify-center shrink-0 shadow-inner">
            <Coffee className="w-6 h-6 stroke-[2.2]" />
          </div>
        </div>

        {/* Card 2: Customers */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EBDCCF] shadow-xs flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#3A1E0D]">
              {stats.todayCustomers}
            </div>
            <div className="text-[11px] sm:text-xs text-stone-500 font-semibold mt-0.5">
              Total Customers
            </div>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0 shadow-inner">
            <Users className="w-6 h-6 stroke-[2.2]" />
          </div>
        </div>

        {/* Card 3: Reviews */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EBDCCF] shadow-xs flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#3A1E0D]">
              {stats.todayReviews}
            </div>
            <div className="text-[11px] sm:text-xs text-stone-500 font-semibold mt-0.5">
              Reviews
            </div>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0 shadow-inner">
            <Star className="w-6 h-6 stroke-[2.2] fill-[#F59E0B]" />
          </div>
        </div>

        {/* Card 4: Rewards Redeemed */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EBDCCF] shadow-xs flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#3A1E0D]">
              {stats.rewardsRedeemed}
            </div>
            <div className="text-[11px] sm:text-xs text-stone-500 font-semibold mt-0.5">
              Rewards Redeemed
            </div>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FCE7F3] text-[#BE185D] flex items-center justify-center shrink-0 shadow-inner">
            <Gift className="w-6 h-6 stroke-[2.2]" />
          </div>
        </div>
      </div>

      {/* Quick Actions Header (Screen 2) */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold tracking-wide text-[#3A1E0D] uppercase px-1">
          Quick Actions
        </h2>

        <div className="space-y-2.5">
          {/* Action 1: Scan Customer QR */}
          <Link
            href={`/staff/${clientSlug}/scan`}
            className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#EBDCCF] hover:border-[#3A1E0D] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#3A1E0D] text-[#E6B875] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#3A1E0D] group-hover:text-[#200F05]">
                  Scan Customer QR
                </div>
                <div className="text-xs text-stone-500">
                  Scan pass with camera to add stamp or redeem reward
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-stone-400 group-hover:text-[#3A1E0D] group-hover:translate-x-0.5 transition-all" />
          </Link>

          {/* Action 2: Add Stamp Manually */}
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="w-full text-left flex items-center justify-between p-4 bg-white rounded-2xl border border-[#EBDCCF] hover:border-[#3A1E0D] hover:shadow-md transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#F3E7DC] text-[#3A1E0D] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#3A1E0D] group-hover:text-[#200F05]">
                  Add Stamp Manually
                </div>
                <div className="text-xs text-stone-500">
                  Lookup by customer name or table number
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-stone-400 group-hover:text-[#3A1E0D] group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Action 3: Customer Lookup */}
          <Link
            href={`/staff/${clientSlug}/customers`}
            className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#EBDCCF] hover:border-[#3A1E0D] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#F3E7DC] text-[#3A1E0D] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <Search className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#3A1E0D] group-hover:text-[#200F05]">
                  Customer Lookup
                </div>
                <div className="text-xs text-stone-500">
                  Search directory, view stamp history & rewards
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-stone-400 group-hover:text-[#3A1E0D] group-hover:translate-x-0.5 transition-all" />
          </Link>

          {/* Action 4: Recent Activity */}
          <Link
            href={`/staff/${clientSlug}/activity`}
            className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#EBDCCF] hover:border-[#3A1E0D] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#F3E7DC] text-[#3A1E0D] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <History className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#3A1E0D] group-hover:text-[#200F05]">
                  Recent Activity
                </div>
                <div className="text-xs text-stone-500">
                  View full chronological staff audit logs
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-stone-400 group-hover:text-[#3A1E0D] group-hover:translate-x-0.5 transition-all" />
          </Link>
        </div>
      </div>

      {/* Live Recent Customers Section */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBDCCF] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Registered Store Customers ({recentCustomers.length})
          </h3>
          <Link
            href={`/staff/${clientSlug}/customers`}
            className="text-xs font-bold text-[#8C5D3B] hover:text-[#3A1E0D] flex items-center gap-1"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentCustomers.length === 0 ? (
          <div className="py-6 text-center text-stone-400">
            <Users className="w-8 h-8 mx-auto mb-1 text-stone-300" />
            <p className="text-xs">No customer profiles registered yet for this store.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {recentCustomers.map((cust) => (
              <Link
                key={cust.id}
                href={`/staff/${clientSlug}/customers/${cust.id}`}
                className="py-2.5 flex items-center justify-between hover:bg-stone-50 px-2 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-[#3A1E0D]"
                    style={{ backgroundColor: cust.avatarBg }}
                  >
                    {cust.avatarInitial}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#3A1E0D] group-hover:text-[#2A1408]">
                      {cust.name}
                    </div>
                    <div className="text-[10px] text-stone-400">
                      #{cust.customerCode || cust.id.substring(0, 6)} • {cust.tableNumber || "Table not provided"}
                    </div>
                  </div>
                </div>

                <div className="text-right flex items-center gap-2">
                  <div className="px-2.5 py-1 rounded-full bg-[#FAF4ED] text-[#4A2810] font-bold text-xs border border-[#E8DCCF]">
                    {cust.stamps} / {cust.stampTarget}
                  </div>
                  {cust.isEligibleForReward && (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Manual Quick Stamp Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-bold text-[#3A1E0D]">Add Stamp Manually</h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {manualSuccessMsg && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">{manualSuccessMsg}</span>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <p className="text-xs text-stone-500">
                Select a customer from the registered store directory:
              </p>
              {recentCustomers.length === 0 ? (
                <p className="text-xs text-stone-400 italic py-4 text-center">
                  No customers found. Scan a customer QR pass to register them.
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {recentCustomers.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-[#FAF7F2] hover:bg-[#F3E7DC] rounded-2xl border border-[#EBDCCF] flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-[#3A1E0D]"
                          style={{ backgroundColor: c.avatarBg }}
                        >
                          {c.avatarInitial}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-[#3A1E0D]">{c.name}</div>
                          <div className="text-[10px] text-stone-400">
                            #{c.customerCode || c.id.substring(0, 6)} • Stamps: {c.stamps}/{c.stampTarget}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleManualQuickStamp(c)}
                        disabled={isSubmittingManual}
                        className="px-3 py-1.5 bg-[#3A1E0D] hover:bg-[#4E2A14] text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingManual ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E6B875]" />
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add +1</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
