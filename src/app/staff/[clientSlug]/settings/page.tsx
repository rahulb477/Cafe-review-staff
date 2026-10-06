"use client";

import React, { use } from "react";
import Link from "next/link";
import { useStaffApp } from "@/context/StaffAppContext";
import {
  ChevronLeft,
  Volume2,
  VolumeX,
  ShieldCheck,
  LogOut,
  Check,
} from "lucide-react";

export default function StaffSettingsPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const { client, staffUser, soundEnabled, setSoundEnabled, logout } = useStaffApp();

  return (
    <div className="max-w-md mx-auto space-y-5 pb-6 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/staff/${clientSlug}`}
          className="w-10 h-10 rounded-full bg-white border border-[#EBDCCF] flex items-center justify-center text-[#3A1E0D] hover:bg-[#FAF4ED] shadow-xs transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-base sm:text-lg font-bold text-[#3A1E0D]">
          Staff & App Settings
        </h1>
        <div className="w-10" />
      </div>

      {/* Staff Profile Card */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBDCCF] shadow-xs flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#3A1E0D] text-[#E6B875] font-bold text-xl flex items-center justify-center shadow-inner shrink-0">
          {(staffUser?.name || "S").charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-extrabold text-[#3A1E0D] truncate">
            {staffUser?.name || "Staff Member"}
          </h2>
          <p className="text-xs text-stone-500 truncate">{staffUser?.email || "No email available"}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-[#FAF3EC] text-[#8C5D3B] text-[10px] font-bold border border-[#EBDCCF]">
              {staffUser?.role || "Staff Member"}
            </span>
            <span className="text-[10px] text-stone-400 font-mono">
              UID: {staffUser?.uid?.substring(0, 8) || "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* App Feedback & Sound Setting */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBDCCF] shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
          Preferences & Audio
        </h3>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF6F0] flex items-center justify-center text-[#3A1E0D]">
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </div>
            <div>
              <div className="font-bold text-xs sm:text-sm text-[#3A1E0D]">Audio Chime Feedback</div>
              <div className="text-[11px] text-stone-400">Play pleasant harmonic chime on stamp & scan</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${
              soundEnabled ? "bg-[#3A1E0D]" : "bg-stone-300"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                soundEnabled ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Active Client Loyalty Configuration */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBDCCF] shadow-xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
          Assigned Store & Loyalty Rules
        </h3>

        <div className="divide-y divide-stone-100 text-xs">
          <div className="py-2 flex items-center justify-between">
            <span className="text-stone-500">Business Tenant</span>
            <span className="font-bold text-[#3A1E0D]">{client?.name || "Not configured"}</span>
          </div>
          <div className="py-2 flex items-center justify-between">
            <span className="text-stone-500">Tenant Client ID</span>
            <span className="font-mono text-stone-700">{staffUser?.clientId || "Not available"}</span>
          </div>
          <div className="py-2 flex items-center justify-between">
            <span className="text-stone-500">Stamp Target</span>
            <span className="font-bold text-[#8C5D3B]">{client?.stampTarget || 0} stamps</span>
          </div>
          <div className="py-2 flex items-center justify-between">
            <span className="text-stone-500">Configured Reward</span>
            <span className="font-bold text-emerald-800">{client?.rewardName || "Not configured"}</span>
          </div>
        </div>
      </div>

      {/* Security & Staff Assignment Rules */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBDCCF] shadow-xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Firestore Security & Staff Isolation</span>
        </h3>

        <div className="space-y-2 text-xs text-stone-600">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Firestore Canonical Model:</strong> Authenticated UID resolves to <code>staffUsers/{'{uid}'}</code>.</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Scoped Nested Transactions:</strong> Stamps stored in <code>clients/{'{clientId}'}/stampTransactions</code>.</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>2-Step Visit Counting:</strong> Atomic transactions increment total visits with idempotency safeguards.</span>
          </div>
        </div>
      </div>

      {/* Sign Out Button */}
      <div className="pt-2">
        <button
          onClick={logout}
          className="w-full py-3.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-2xl border border-red-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Staff Session</span>
        </button>
      </div>
    </div>
  );
}
