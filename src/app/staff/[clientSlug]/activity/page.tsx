"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  ChevronLeft,
  Coffee,
  Gift,
  UserCheck,
  Clock,
  Loader2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { StaffActivityItem } from "@/services/types";

export default function RecentActivityPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug || "bake";

  const { client, staffUser } = useStaffApp();
  const effectiveClientId = staffUser?.clientId || clientSlug;

  const [activities, setActivities] = useState<StaffActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<string>("All Activity");

  useEffect(() => {
    if (!effectiveClientId) return;

    const unsubscribe = FirebaseService.listenToRecentActivity(effectiveClientId, (liveItems) => {
      setActivities(liveItems);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveClientId]);

  const filterOptions = ["All Activity", "Stamps", "Rewards"];

  const filteredActivities = activities.filter((act) => {
    if (selectedFilter === "Stamps") return act.activityType === "STAMP_ADDED";
    if (selectedFilter === "Rewards") return act.activityType === "REWARD_REDEEMED";
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
          Recent Activity
        </h1>
        <div className="w-10" />
      </div>

      {/* Filter Dropdown / Pills matching Screen 11 */}
      <div className="bg-white rounded-2xl p-2 border border-[#EBDCCF] shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full py-1">
          {filterOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setSelectedFilter(opt)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedFilter === opt
                  ? "bg-[#3A1E0D] text-white shadow-xs"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Timeline Container matching Screen 11 */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#EBDCCF] shadow-xs">
        {isLoading ? (
          <div className="py-12 text-center text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#3A1E0D]" />
            <p className="text-xs">Loading activity stream from Firestore...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-12 text-center text-stone-400">
            <Clock className="w-8 h-8 mx-auto mb-2 text-stone-300" />
            <p className="font-bold text-sm text-[#3A1E0D]">No Activity Recorded</p>
            <p className="text-xs text-stone-400 mt-1">
              Stamps added and rewards redeemed for {client?.name || "this store"} will appear here in real-time.
            </p>
          </div>
        ) : (
          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-0.5 before:bg-[#EBDCCF]">
            {filteredActivities.map((act) => {
              const isStamp = act.activityType === "STAMP_ADDED";
              const isReward = act.activityType === "REWARD_REDEEMED";

              return (
                <div key={act.id} className="relative group">
                  {/* Timeline Node Icon (Screen 11) */}
                  <div
                    className={`absolute -left-6 sm:-left-8 top-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-[#DFC8B4] ${
                      isStamp
                        ? "bg-[#FFEDD5] text-[#C2410C]"
                        : isReward
                        ? "bg-[#FCE7F3] text-[#BE185D]"
                        : "bg-[#DCFCE7] text-[#15803D]"
                    }`}
                  >
                    {isStamp ? (
                      <Coffee className="w-3.5 h-3.5" />
                    ) : isReward ? (
                      <Gift className="w-3.5 h-3.5" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                  </div>

                  {/* Activity Details Card (Screen 11) */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        <span>{act.timeFormatted || "Just now"}</span>
                      </div>
                      <h3 className="font-extrabold text-xs sm:text-sm text-[#3A1E0D] mt-0.5">
                        {act.title}
                      </h3>
                      <p className="text-xs text-stone-500 font-medium">
                        {act.description}
                      </p>
                      {act.customerId && (
                        <Link
                          href={`/staff/${clientSlug}/customers/${act.customerId}`}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#8C5D3B] hover:text-[#3A1E0D] mt-1"
                        >
                          <span>View Profile</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>

                    {/* Badge on Right matching Screen 11 */}
                    <div>
                      {isStamp ? (
                        <span className="px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] font-extrabold text-xs shadow-2xs">
                          +1
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-[#FCE7F3] text-[#BE185D] font-extrabold text-xs shadow-2xs flex items-center gap-1">
                          <Gift className="w-3 h-3" /> Redeemed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="p-3 bg-[#FAF7F2] rounded-2xl border border-[#EBDCCF] flex items-center justify-between text-[11px] text-[#8C5D3B]">
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Scoped to {client?.name || effectiveClientId}</span>
        </div>
        <span className="font-bold">{client?.name || "Store"}</span>
      </div>
    </div>
  );
}
