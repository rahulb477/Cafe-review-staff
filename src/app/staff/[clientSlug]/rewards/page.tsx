"use client";

import React, { useEffect, useState, use } from "react";
import { Award, Gift } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  toStaffServiceError,
} from "@/services/staffErrors";
import type { CustomerProfile } from "@/services/types";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeading } from "@/components/ui/Card";
import { CustomerCard } from "@/components/ui/CustomerCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { LinkButton } from "@/components/ui/Button";
import { GiftBoxIllustration } from "@/components/Icons";

const ELIGIBLE_DIRECTORY_LIMIT = 100;

/** Rewards catalogue + the live queue of customers ready to redeem. */
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
        const customers = await FirebaseService.getCustomers({ limit: ELIGIBLE_DIRECTORY_LIMIT });
        if (!active) return;
        setReadyCustomers(
          customers.filter(
            (customer) => customer.isEligibleForReward || customer.stamps >= customer.stampTarget
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
  const rewardDescription =
    client?.rewardDescription || "Configure a reward in Firebase to display it here.";
  const stampTarget = client?.stampTarget || 0;

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <ScreenHeader title="Rewards" backHref={`/staff/${clientSlug}`} />

      {/* Active offer — always read from clients/{clientId}.loyalty */}
      <section
        className={cn(
          "cafe-motif relative overflow-hidden rounded-2xl border border-espresso-900",
          "bg-espresso-800 p-5 text-cream-100 shadow-raise"
        )}
      >
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-caramel-300/35 bg-caramel-300/15 px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-caramel-300">
              <Award className="size-3" aria-hidden="true" />
              Current Offer
            </span>
            <h2 className="mt-2.5 truncate text-[1.2rem] font-extrabold tracking-tight text-cream-50">
              {rewardTitle}
            </h2>
            <p className="mt-1.5 text-[0.76rem] font-medium leading-relaxed text-cream-300/85">
              {rewardDescription}
            </p>
          </div>
          <GiftBoxIllustration className="size-16 shrink-0" />
        </div>

        <div className="relative mt-5 flex items-center justify-between border-t border-cream-50/12 pt-3.5 text-[0.74rem]">
          <span className="font-medium text-cream-300/80">Target required</span>
          <span className="font-extrabold text-caramel-300 tabular-nums">
            {stampTarget} stamps
          </span>
        </div>
      </section>

      {/* Live redemption queue */}
      <section className="space-y-2.5">
        <SectionHeading
          title="Ready for Redemption"
          action={
            !isLoading && !errorMessage ? (
              <span className="text-[0.7rem] font-semibold text-espresso-300 tabular-nums">
                {readyCustomers.length}
              </span>
            ) : undefined
          }
        />

        {errorMessage ? (
          <ErrorState message={errorMessage} title="Rewards unavailable" />
        ) : isLoading ? (
          <LoadingState rows={2} label="Checking eligible customers…" />
        ) : readyCustomers.length === 0 ? (
          <EmptyState
            icon={<Gift />}
            title="No pending redemptions"
            message={
              stampTarget > 0
                ? `Customers who reach ${stampTarget} / ${stampTarget} stamps will appear here ready to claim ${rewardTitle}.`
                : "Customers who complete their loyalty card will appear here."
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {readyCustomers.map((customer) => (
              <li key={customer.id}>
                <CustomerCard
                  customer={customer}
                  activityMillis={customer.lastActivityMillis}
                  trailing={
                    <LinkButton
                      href={`/staff/${clientSlug}/customers/${customer.id}`}
                      size="sm"
                      variant="success"
                    >
                      Redeem
                    </LinkButton>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
