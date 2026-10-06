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
import {
  ChevronLeft,
  Search,
  QrCode,
  Gift,
  Loader2,
  X,
  Users,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { CustomerProfile } from "@/services/types";

export default function CustomerLookupPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const router = useRouter();
  const { clientId } = useStaffApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "reward_ready">("all");

  /**
   * Every query is scoped by the authenticated staff clientId inside the
   * service (Firestore rules are not filters, so the query itself pins
   * `clientId`). A search term is translated into equality/prefix Firestore
   * queries — the directory is never downloaded and filtered in the browser.
   */
  const fetchCustomers = useCallback(async (term: string) => {
    setIsLoading(true);
    try {
      const list = await FirebaseService.getCustomers({ search: term });
      setCustomers(list);
      setErrorMessage(null);
    } catch (error: unknown) {
      const staffErr = toStaffServiceError(error);
      console.error("[customers] lookup failed:", describeErrorForDiagnostics(staffErr));
      setCustomers([]);
      setErrorMessage(staffErr.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search — one Firestore query per settled term instead of one per
  // keystroke.
  useEffect(() => {
    if (!clientId) return;
    const handle = window.setTimeout(() => {
      void fetchCustomers(searchQuery);
    }, searchQuery ? 300 : 0);
    return () => window.clearTimeout(handle);
  }, [clientId, fetchCustomers, searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Filter based on tab
  const filteredCustomers = customers.filter((c) => {
    if (activeTab === "reward_ready") return c.stamps >= c.stampTarget || c.isEligibleForReward;
    return true;
  });

  return (
    <div className="max-w-md mx-auto space-y-4 pb-6 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/staff/${clientSlug}`}
          className="w-10 h-10 rounded-full bg-white border border-[#EBDCCF] flex items-center justify-center text-[#3A1E0D] hover:bg-[#FAF4ED] shadow-xs transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-base sm:text-lg font-bold text-[#3A1E0D]">
          Customer Lookup
        </h1>
        <div className="w-10" />
      </div>

      {/* Search Field with QR shortcut matching Screen 9 */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by customer ID or name..."
            className="w-full pl-10 pr-9 py-3 bg-white rounded-2xl border border-[#EBDCCF] text-xs sm:text-sm text-[#3A1E0D] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#3A1E0D] shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* QR Scan Button Shortcut */}
        <Link
          href={`/staff/${clientSlug}/scan`}
          className="w-12 h-12 bg-[#3A1E0D] hover:bg-[#4E2A14] text-[#E6B875] rounded-2xl flex items-center justify-center shadow-xs transition-colors shrink-0"
          title="Scan QR Code"
        >
          <QrCode className="w-5 h-5" />
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === "all"
              ? "bg-[#3A1E0D] text-white shadow-xs"
              : "bg-white text-stone-600 hover:bg-stone-100 border border-[#EBDCCF]"
          }`}
        >
          All Customers ({customers.length})
        </button>
        <button
          onClick={() => setActiveTab("reward_ready")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === "reward_ready"
              ? "bg-emerald-700 text-white shadow-xs"
              : "bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200"
          }`}
        >
          <Gift className="w-3.5 h-3.5" />
          <span>Reward Ready</span>
        </button>
      </div>

      {/* Customers List Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400">
          Customer Directory
        </h2>
        <span className="text-[11px] text-stone-400">
          {filteredCustomers.length} results
        </span>
      </div>

      {/* Customer List matching Screen 9 */}
      {errorMessage ? (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchCustomers(searchQuery)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-red-200 font-bold text-[11px] hover:bg-red-50 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#3A1E0D]" />
          <p className="text-xs">Loading customer directory from Firestore...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-[#EBDCCF] shadow-xs">
          <Users className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="font-bold text-sm text-[#3A1E0D]">
            {searchQuery ? `No customers match "${searchQuery}"` : "No registered customers yet"}
          </p>
          <p className="text-xs text-stone-400 mt-1">
            {searchQuery ? "Check the search spelling or clear the filter." : "Customers will appear here when they join and scan their pass."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredCustomers.map((cust) => {
            const isRewardReady = cust.stamps >= cust.stampTarget || cust.isEligibleForReward;
            return (
              <Link
                key={cust.id}
                href={`/staff/${clientSlug}/customers/${cust.id}`}
                className={`flex items-center justify-between p-3.5 sm:p-4 bg-white rounded-2xl border transition-all hover:border-[#3A1E0D] hover:shadow-md group ${
                  isRewardReady ? "border-emerald-300 bg-emerald-50/20" : "border-[#EBDCCF]"
                }`}
              >
                {/* Left Profile info */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm text-[#3A1E0D] shadow-inner shrink-0"
                    style={{ backgroundColor: cust.avatarBg }}
                  >
                    {cust.avatarInitial}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[#3A1E0D] group-hover:text-[#2A1408]">
                        {cust.name}
                      </span>
                      {isRewardReady && (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center gap-0.5">
                          <Gift className="w-2.5 h-2.5" /> Ready
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      #{cust.customerCode || cust.id.substring(0, 6)} • {cust.tableNumber || "Table not provided"}
                    </div>
                  </div>
                </div>

                {/* Right Stamp Count & Time */}
                <div className="text-right">
                  <div
                    className={`font-extrabold text-sm ${
                      isRewardReady ? "text-emerald-700" : "text-[#3A1E0D]"
                    }`}
                  >
                    {cust.stamps} / {cust.stampTarget}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">
                    {cust.totalVisits} {cust.totalVisits === 1 ? "visit" : "visits"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
