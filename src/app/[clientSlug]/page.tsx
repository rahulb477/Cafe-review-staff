"use client";

import React, { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { BakedLogoIcon, SingleStampBean } from "@/components/Icons";
import { QrCode, Gift, ArrowRight, RefreshCw, Smartphone } from "lucide-react";
import { CustomerProfile, ClientConfig } from "@/services/types";

export default function CustomerPassCompanionPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug || "bake";

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [client, setClient] = useState<ClientConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomerPass = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cRes, custRes] = await Promise.all([
        fetch(`/api/clients/${clientSlug}`),
        fetch(`/api/clients/${clientSlug}/customers`),
      ]);

      if (cRes.ok) {
        const d = await cRes.json();
        if (d.client) setClient(d.client);
      }
      if (custRes.ok) {
        const d = await custRes.json();
        if (d.customers && d.customers.length > 0) {
          setCustomer(d.customers[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [clientSlug]);

  useEffect(() => {
    fetchCustomerPass();
    const interval = setInterval(fetchCustomerPass, 4000);
    return () => clearInterval(interval);
  }, [fetchCustomerPass]);

  const stampTarget = client?.stampTarget || 8;
  const stamps = customer?.stamps || 0;
  const stampsRemaining = Math.max(0, stampTarget - stamps);
  const isRewardReady = stamps >= stampTarget || customer?.isEligibleForReward;

  return (
    <div className="min-h-screen bg-[#2D1808] p-4 flex flex-col items-center justify-center select-none">
      {/* Top Banner */}
      <div className="w-full max-w-sm mb-4 flex items-center justify-between text-xs text-[#E6B875]">
        <div className="flex items-center gap-1.5 font-bold">
          <Smartphone className="w-4 h-4" />
          <span>Customer Loyalty Pass</span>
        </div>
        <Link
          href={`/staff/${clientSlug}`}
          className="px-3 py-1 bg-[#4A2810] hover:bg-[#5E3618] text-white rounded-full font-bold flex items-center gap-1 transition-colors border border-[#B97B32]/40"
        >
          <span>Staff View</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Main Digital Pass Card */}
      <div className="w-full max-w-sm bg-[#FFFDF9] rounded-3xl p-6 shadow-2xl border border-[#EBDCCF] space-y-5">
        {/* Pass Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <BakedLogoIcon className="w-10 h-10" />
            <div>
              <h1 className="font-extrabold text-sm text-[#3A1E0D]">
                {client?.name || "BAKE"}
              </h1>
              <p className="text-[10px] text-stone-400 font-semibold tracking-wider uppercase">
                {client?.tagline || "CAFÉ & BAKERY"}
              </p>
            </div>
          </div>
          <button
            onClick={fetchCustomerPass}
            className="p-2 text-stone-400 hover:text-stone-600 rounded-full cursor-pointer"
            title="Refresh pass"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Customer Information */}
        <div className="flex items-center gap-3 p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBDCCF]">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-[#3A1E0D]"
            style={{ backgroundColor: customer?.avatarBg || "#E8D5C4" }}
          >
            {customer?.avatarInitial || "C"}
          </div>
          <div>
            <h2 className="font-bold text-sm text-[#3A1E0D]">
              {customer?.name || "Customer Pass"}
            </h2>
            <p className="text-[10px] text-stone-400">
              Pass ID: #{customer?.customerCode || customer?.id?.substring(0, 6) || "PASS"} • {customer?.tableNumber || "Store Member"}
            </p>
          </div>
        </div>

        {/* Real-time Stamp Card */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-[#3A1E0D]">Loyalty Stamps</span>
            <span className="font-extrabold text-sm text-[#3A1E0D]">
              {stamps} / {stampTarget}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 justify-items-center py-1">
            {Array.from({ length: stampTarget }).map((_, idx) => (
              <SingleStampBean key={idx} isFilled={idx < stamps} targetNumber={idx + 1} />
            ))}
          </div>

          {isRewardReady ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-bold flex items-center gap-2">
              <Gift className="w-4 h-4 text-emerald-600" />
              <span>Reward Unlocked! Show this pass to staff to redeem.</span>
            </div>
          ) : (
            <div className="p-3 bg-[#FFF8F0] border border-[#F5DEC7] rounded-xl text-xs text-[#8C5D3B] font-semibold flex items-center gap-2">
              <Gift className="w-4 h-4 text-[#B97B32]" />
              <span>{stampsRemaining} more stamps for {client?.rewardName || "Free Coffee"}</span>
            </div>
          )}
        </div>

        {/* QR Code Pass for staff to scan */}
        <div className="pt-2 text-center space-y-2">
          <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-[#DFC8B4] inline-block shadow-inner">
            <div className="w-36 h-36 bg-[#3A1E0D] rounded-xl p-2 flex items-center justify-center text-white">
              <QrCode className="w-28 h-28 text-[#E6B875]" />
            </div>
          </div>
          <p className="text-[11px] text-stone-500 font-medium">
            Present this QR to staff when ordering
          </p>
        </div>
      </div>
    </div>
  );
}
