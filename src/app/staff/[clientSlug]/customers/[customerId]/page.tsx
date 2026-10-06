"use client";

import React, { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  toStaffServiceError,
} from "@/services/staffErrors";
import confetti from "canvas-confetti";
import {
  SingleStampBean,
  CoffeeCupIllustration,
  GiftBoxIllustration,
} from "@/components/Icons";
import {
  ChevronLeft,
  Gift,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { CustomerProfile } from "@/services/types";

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ clientSlug: string; customerId: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;
  const customerId = resolvedParams.customerId;

  const router = useRouter();
  const { playChime, staffUser, client, clientId } = useStaffApp();

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Modals & View States
  const [showConfirmStampModal, setShowConfirmStampModal] = useState(false);
  const [showRedeemConfirmModal, setShowRedeemConfirmModal] = useState(false);
  const [viewState, setViewState] = useState<"detail" | "stamp_success" | "reward_unlocked">("detail");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCustomer = useCallback(async () => {
    if (!clientId) return;
    setIsLoading(true);
    setError("");
    try {
      // The service resolves the customer inside the authenticated clientId —
      // the route slug/customerId never widen access.
      const data = await FirebaseService.getCustomerById(customerId);
      setCustomer(data);
    } catch (e: unknown) {
      const staffErr = toStaffServiceError(e, "CUSTOMER_NOT_FOUND");
      console.error("[customer-detail] load failed:", describeErrorForDiagnostics(staffErr));
      setCustomer(null);
      setError(staffErr.message);
    } finally {
      setIsLoading(false);
    }
  }, [clientId, customerId]);

  useEffect(() => {
    const loadHandle = window.setTimeout(() => {
      void fetchCustomer();
    }, 0);
    return () => window.clearTimeout(loadHandle);
  }, [fetchCustomer]);

  // Trigger celebration confetti
  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#D4A373", "#B97B32", "#E11D48", "#10B981", "#3A1E0D"],
      });
    } catch {
      // fallback
    }
  };

  // Safe 2-Step Atomic Stamp Transaction
  const handleConfirmAddStamp = async () => {
    if (!customer || !staffUser || isSubmitting) return;
    setIsSubmitting(true);
    setShowConfirmStampModal(false);

    try {
      const data = await FirebaseService.addStamp(customer.id);

      if (data.success && data.customer) {
        setCustomer(data.customer);
        triggerConfetti();

        if (data.rewardUnlocked) {
          playChime("reward");
          setViewState("reward_unlocked");
        } else {
          playChime("stamp");
          setViewState("stamp_success");
        }
      } else {
        setError("Failed to add stamp.");
        playChime("error");
      }
    } catch (e: unknown) {
      const staffErr = toStaffServiceError(e, "UNKNOWN");
      console.error("[customer-detail] stamp failed:", describeErrorForDiagnostics(staffErr));
      setError(staffErr.message);
      playChime("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Atomic Reward Redemption in clients/{clientId}/rewardRedemptions/{redemptionId}
  const handleConfirmRedeem = async () => {
    if (!customer || !staffUser || isSubmitting) return;
    setIsSubmitting(true);
    setShowRedeemConfirmModal(false);

    try {
      const data = await FirebaseService.redeemReward(customer.id);

      if (data.success && data.customer) {
        setCustomer(data.customer);
        playChime("reward");
        triggerConfetti();
        setViewState("detail");
      } else {
        setError("Failed to redeem reward.");
        playChime("error");
      }
    } catch (e: unknown) {
      const staffErr = toStaffServiceError(e, "UNKNOWN");
      console.error("[customer-detail] redemption failed:", describeErrorForDiagnostics(staffErr));
      setError(staffErr.message);
      playChime("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#3A1E0D]" />
        <p className="text-xs text-stone-500 font-medium">Finding customer in store records...</p>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 bg-white rounded-3xl border border-stone-200 text-center shadow-sm">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-[#3A1E0D]">Customer Lookup Notice</h2>
        <p className="text-xs text-stone-500 mt-2">{error || "Could not retrieve customer details."}</p>
        <Link
          href={`/staff/${clientSlug}/customers`}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A1E0D] text-white rounded-2xl text-xs font-bold"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Customers</span>
        </Link>
      </div>
    );
  }

  const stampTarget = customer.stampTarget || client?.stampTarget || 0;
  const stampsCount = customer.stamps;
  const stampsRemaining = Math.max(0, stampTarget - stampsCount);
  const isRewardReady = stampsCount >= stampTarget || customer.isEligibleForReward;
  const rewardTitle = customer.rewardName || client?.rewardName || "Reward not configured";

  // ==========================================
  // VIEW 1: STAMP ADDED SUCCESS (SCREEN 6)
  // ==========================================
  if (viewState === "stamp_success") {
    return (
      <div className="min-h-[80vh] flex flex-col justify-between max-w-md mx-auto py-2 select-none">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewState("detail")}
            className="w-10 h-10 rounded-full bg-white border border-[#EBDCCF] flex items-center justify-center text-[#3A1E0D] hover:bg-[#FAF4ED] shadow-xs cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold text-[#3A1E0D]">Stamp Added</h1>
          <div className="w-10" />
        </div>

        {/* Center Illustration & Congrats */}
        <div className="my-auto text-center px-4 py-6">
          <div className="mb-4">
            <CoffeeCupIllustration className="w-28 h-28 mx-auto" />
          </div>

          <h2 className="text-2xl font-extrabold text-[#3A1E0D] tracking-tight">
            Stamp Added!
          </h2>
          <p className="text-sm font-medium text-stone-600 mt-1">
            {customer.name} now has <span className="font-bold text-[#3A1E0D]">{stampsCount} / {stampTarget}</span> stamps
          </p>

          {/* Visual Stamp Row matching Screen 6 */}
          <div className="my-6 p-4 bg-white rounded-2xl border border-[#EBDCCF] shadow-xs">
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {Array.from({ length: stampTarget }).map((_, idx) => (
                <SingleStampBean key={idx} isFilled={idx < stampsCount} targetNumber={idx + 1} />
              ))}
            </div>
          </div>

          {/* Reward Status Banner */}
          <div className="p-3.5 bg-[#FFF8F0] border border-[#F5DEC7] rounded-2xl flex items-center justify-center gap-2.5 text-xs text-[#8C5D3B] font-semibold">
            <Gift className="w-4 h-4 text-[#B97B32] shrink-0" />
            <span>
              {stampsRemaining > 0
                ? `${stampsRemaining} more stamps for ${rewardTitle}`
                : `Reward Ready: ${rewardTitle}`}
            </span>
          </div>
        </div>

        {/* Action Buttons matching Screen 6 */}
        <div className="space-y-2.5 pt-4">
          <button
            onClick={() => setViewState("detail")}
            className="w-full py-3.5 px-4 bg-[#3A1E0D] hover:bg-[#4E2A14] active:scale-[0.99] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#3A1E0D]/10 transition-all cursor-pointer"
          >
            View Customer
          </button>
          <Link
            href={`/staff/${clientSlug}/scan`}
            className="w-full py-3.5 px-4 bg-[#F5EBE0] hover:bg-[#ECD8C8] active:scale-[0.99] text-[#3A1E0D] font-bold text-sm rounded-2xl border border-[#DFC8B4] text-center block transition-all"
          >
            Back to Scan
          </Link>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: REWARD UNLOCKED STATE (SCREEN 7)
  // ==========================================
  if (viewState === "reward_unlocked") {
    return (
      <div className="min-h-[80vh] flex flex-col justify-between max-w-md mx-auto py-2 select-none">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewState("detail")}
            className="w-10 h-10 rounded-full bg-white border border-[#EBDCCF] flex items-center justify-center text-[#3A1E0D] hover:bg-[#FAF4ED] shadow-xs cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold text-[#3A1E0D]">Reward Unlocked</h1>
          <div className="w-10" />
        </div>

        {/* Center Celebration */}
        <div className="my-auto text-center px-4 py-4">
          <div className="mb-4">
            <GiftBoxIllustration className="w-28 h-28 mx-auto" />
          </div>

          <h2 className="text-2xl font-extrabold text-[#3A1E0D] tracking-tight">
            Reward Unlocked!
          </h2>
          <p className="text-xs sm:text-sm font-medium text-stone-600 mt-1">
            This customer has completed <span className="font-bold text-[#3A1E0D]">{stampTarget} / {stampTarget}</span> stamps.
          </p>

          {/* Reward Item Card matching Screen 7 */}
          <div className="my-6 p-4 bg-white rounded-3xl border border-[#EBDCCF] shadow-sm flex items-center gap-4 text-left">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF8F0] border border-[#F5DEC7] flex items-center justify-center shrink-0">
              <CoffeeCupIllustration className="w-10 h-10" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#3A1E0D]">{rewardTitle}</h3>
              <p className="text-xs text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Reward Ready for Redemption
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons matching Screen 7 */}
        <div className="space-y-2.5 pt-4">
          <button
            onClick={() => setShowRedeemConfirmModal(true)}
            className="w-full py-3.5 px-4 bg-[#3A1E0D] hover:bg-[#4E2A14] active:scale-[0.99] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#3A1E0D]/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Mark as Redeemed</span>
            <ArrowRight className="w-4 h-4 text-[#E6B875]" />
          </button>
          <button
            onClick={() => setViewState("detail")}
            className="w-full py-3.5 px-4 bg-[#F5EBE0] hover:bg-[#ECD8C8] text-[#3A1E0D] font-bold text-sm rounded-2xl border border-[#DFC8B4] text-center block transition-all cursor-pointer"
          >
            View Customer
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: CUSTOMER DETAILS DEFAULT (SCREEN 4 & 10)
  // ==========================================
  return (
    <div className="max-w-md mx-auto space-y-4 pb-4 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/staff/${clientSlug}/customers`}
          className="w-10 h-10 rounded-full bg-white border border-[#EBDCCF] flex items-center justify-center text-[#3A1E0D] hover:bg-[#FAF4ED] shadow-xs transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-base sm:text-lg font-bold text-[#3A1E0D]">
          Customer Details
        </h1>
        <div className="w-10" />
      </div>

      {/* Customer Profile Header (Screen 4 / Screen 10) */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBDCCF] shadow-xs flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-xl text-[#3A1E0D] shadow-inner shrink-0"
          style={{ backgroundColor: customer.avatarBg || "#E8D5C4" }}
        >
          {customer.avatarInitial || customer.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-[#3A1E0D] leading-tight truncate">
            {customer.name}
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Customer #{customer.customerCode || customer.id.substring(0, 6)}
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5 truncate">
            {customer.tableNumber || "Table not provided"} • Visiting since {customer.visitingSince || "Not provided"}
          </p>
        </div>
      </div>

      {/* Loyalty Stamps Card (Screen 4 / Screen 10) */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBDCCF] shadow-xs space-y-4">
        {/* Header with Stamp Fraction */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm text-[#3A1E0D]">Loyalty Stamps</span>
          <span className="font-extrabold text-base text-[#3A1E0D]">
            {stampsCount} / {stampTarget}
          </span>
        </div>

        {/* Coffee Bean Stamp Indicators Grid */}
        <div className="py-2">
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5 justify-items-center">
            {Array.from({ length: stampTarget }).map((_, idx) => (
              <SingleStampBean key={idx} isFilled={idx < stampsCount} targetNumber={idx + 1} />
            ))}
          </div>
        </div>

        {/* Milestone / Reward Banner */}
        {isRewardReady ? (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-emerald-900">Reward Available!</div>
              <div className="text-[11px] text-emerald-700">{rewardTitle}</div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-[#FFF8F0] border border-[#F5DEC7] rounded-2xl flex items-center gap-3">
            <Gift className="w-5 h-5 text-[#B97B32] shrink-0" />
            <span className="text-xs text-[#8C5D3B] font-semibold">
              {stampsRemaining} more {stampsRemaining === 1 ? "stamp" : "stamps"} for {rewardTitle}
            </span>
          </div>
        )}

        {/* Info Rows matching Screen 4 / 10 */}
        <div className="pt-2 divide-y divide-stone-100 text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-stone-500 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-stone-400" /> Last Stamp
            </span>
            <span className="font-semibold text-stone-800">
              {customer.lastStampAt || "Today"}
            </span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-stone-500 flex items-center gap-1.5 font-medium">
              <RotateCcw className="w-3.5 h-3.5 text-stone-400" /> Total Visits
            </span>
            <span className="font-semibold text-stone-800">
              {customer.totalVisits} {customer.totalVisits === 1 ? "time" : "times"}
            </span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-stone-500 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-400" /> Status
            </span>
            {isRewardReady ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                Eligible for Reward
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-[#FAF3EC] text-[#8C5D3B] font-bold text-[11px] border border-[#EBDCCF]">
                Not Eligible Yet
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Primary Action Button (Add 1 Stamp vs Mark as Redeemed) */}
      <div className="pt-2">
        {isRewardReady ? (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowRedeemConfirmModal(true)}
            className="w-full py-4 px-4 bg-[#3A1E0D] hover:bg-[#4E2A14] active:scale-[0.99] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#3A1E0D]/15 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
          >
            <span>Mark as Redeemed</span>
            <ArrowRight className="w-4 h-4 text-[#E6B875]" />
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowConfirmStampModal(true)}
            className="w-full py-4 px-4 bg-[#3A1E0D] hover:bg-[#4E2A14] active:scale-[0.99] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#3A1E0D]/15 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
          >
            <span>Add 1 Stamp</span>
            <ArrowRight className="w-4 h-4 text-[#E6B875]" />
          </button>
        )}
      </div>

      {/* ==========================================
          MODAL 1: ADD 1 STAMP CONFIRMATION (SCREEN 5)
          ========================================== */}
      {showConfirmStampModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-150">
            {/* Coffee cup illustration with sparkles (Screen 5) */}
            <div className="mb-3">
              <CoffeeCupIllustration className="w-20 h-20 mx-auto" />
            </div>

            <h3 className="text-lg font-extrabold text-[#3A1E0D]">
              Add 1 Loyalty Stamp?
            </h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              This will add 1 stamp to <span className="font-bold text-[#3A1E0D]">{customer.name}</span>&apos;s loyalty account.
            </p>

            {/* Buttons (Screen 5) */}
            <div className="mt-6 space-y-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmAddStamp}
                className="w-full py-3.5 bg-[#3A1E0D] hover:bg-[#4E2A14] active:scale-[0.99] text-white font-bold text-sm rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#E6B875]" />
                ) : (
                  <span>Confirm</span>
                )}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmStampModal(false)}
                className="w-full py-3 bg-[#F5EBE0] hover:bg-[#ECD8C8] text-[#3A1E0D] font-bold text-xs rounded-2xl border border-[#DFC8B4] transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 2: REDEEM REWARD CONFIRMATION (SCREEN 8)
          ========================================== */}
      {showRedeemConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-150">
            {/* Customer Pill info */}
            <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBDCCF] flex items-center gap-3 mb-4 text-left">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-[#3A1E0D]"
                style={{ backgroundColor: customer.avatarBg || "#E8D5C4" }}
              >
                {customer.avatarInitial}
              </div>
              <div>
                <h4 className="font-bold text-xs text-[#3A1E0D]">{customer.name}</h4>
                <p className="text-[10px] text-stone-500">Customer #{customer.customerCode || customer.id.substring(0, 6)}</p>
              </div>
            </div>

            {/* Reward item thumbnail (Screen 8) */}
            <div className="p-3 bg-[#FFF8F0] border border-[#F5DEC7] rounded-2xl flex items-center gap-3 text-left mb-4">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
                <CoffeeCupIllustration className="w-8 h-8" />
              </div>
              <div>
                <div className="font-bold text-xs text-[#3A1E0D]">{rewardTitle}</div>
                <div className="text-[10px] text-stone-500">Reward</div>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Mark this reward as redeemed? This will reset the customer&apos;s stamps to <span className="font-bold text-[#3A1E0D]">0 / {stampTarget}</span> after redemption.
            </p>

            {/* Buttons (Screen 8) */}
            <div className="mt-6 space-y-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmRedeem}
                className="w-full py-3.5 bg-[#3A1E0D] hover:bg-[#4E2A14] active:scale-[0.99] text-white font-bold text-sm rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#E6B875]" />
                ) : (
                  <span>Confirm Redemption</span>
                )}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowRedeemConfirmModal(false)}
                className="w-full py-3 bg-[#F5EBE0] hover:bg-[#ECD8C8] text-[#3A1E0D] font-bold text-xs rounded-2xl border border-[#DFC8B4] transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
