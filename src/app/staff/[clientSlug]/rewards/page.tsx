"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useStaffApp } from "@/context/StaffAppContext";
import { CoffeeCupIllustration, GiftBoxIllustration } from "@/components/Icons";
import { FirebaseService } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  toStaffServiceError,
} from "@/services/staffErrors";
import {
  ChevronLeft,
  Gift,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Award,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { CustomerProfile } from "@/services/types";

export default function RewardsCatalogPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const { client, clientId } = useStaffApp();

  const [readyCustomers, setReadyCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let active = true;

    async function loadReady() {
      setIsLoading(true);
      try {
        const customers = await FirebaseService.getCustomers({ limit: 100 });
        if (!active) return;
        setReadyCustomers(
          customers.filter(
            (c: CustomerProfile) => c.isEligibleForReward || c.stamps >= c.stampTarget
          )
        );
        setErrorMessage(null);
      } catch (error: unknown) {
        const staffErr = toStaffServiceError(error);
        console.error("[rewards] eligible customers failed:", describeErrorForDiagnostics(staffErr));
        if (!active) return;
        setReadyCustomers([]);
        setErrorMessage(staffErr.message);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadReady();
    return () => {
      active = false;
    };
  }, [clientId]);

  const rewardTitle = client?.rewardName || "Reward not configured";
  const rewardDesc = client?.rewardDescription || "Configure a reward in Firebase to display it here.";
  const stampTarget = client?.stampTarget || 0;

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
          Rewards & Redemptions
        </h1>
        <div className="w-10" />
      </div>

      {/* Active Reward Offer Card */}
      <div className="bg-gradient-to-br from-[#3A1E0D] to-[#251206] text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-[#E6B875]/10 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E6B875]/20 text-[#E6B875] text-[11px] font-bold mb-3 border border-[#E6B875]/30">
              <Award className="w-3.5 h-3.5" /> Current Store Offer
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              {rewardTitle}
            </h2>
            <p className="text-xs text-stone-300 mt-1 max-w-xs leading-relaxed">
              {rewardDesc}
            </p>
          </div>
          <GiftBoxIllustration className="w-16 h-16 shrink-0" />
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-stone-300">
          <span>Target Required:</span>
          <span className="font-extrabold text-[#E6B875] text-sm">{stampTarget} Stamps</span>
        </div>
      </div>

      {/* Pending Unlocked Customers Ready for Redemption */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Customers Eligible for Redemption ({readyCustomers.length})
          </h3>
        </div>

        {errorMessage ? (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        ) : isLoading ? (
          <div className="py-8 text-center text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#3A1E0D]" />
            <p className="text-xs">Checking reward eligible customer accounts...</p>
          </div>
        ) : readyCustomers.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 text-center border border-[#EBDCCF] shadow-xs">
            <CheckCircle2 className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p className="font-bold text-sm text-[#3A1E0D]">No Pending Redemptions</p>
            <p className="text-xs text-stone-400 mt-1">
              Customers who reach {stampTarget}/{stampTarget} stamps will appear here ready to claim their reward.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {readyCustomers.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-4 border border-emerald-300 shadow-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-[#3A1E0D]"
                    style={{ backgroundColor: c.avatarBg }}
                  >
                    {c.avatarInitial}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#3A1E0D]">{c.name}</div>
                    <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <Gift className="w-3 h-3" /> Ready: {c.stamps}/{c.stampTarget} stamps
                    </div>
                  </div>
                </div>

                <Link
                  href={`/staff/${clientSlug}/customers/${c.id}`}
                  className="px-3.5 py-2 bg-[#3A1E0D] hover:bg-[#4E2A14] text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-xs"
                >
                  <span>Redeem</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#E6B875]" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
