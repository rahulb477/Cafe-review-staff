"use client";

import React, { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Gift,
  Phone,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { stampFraction } from "@/lib/format";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  toStaffServiceError,
} from "@/services/staffErrors";
import type { CustomerProfile } from "@/services/types";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button, LinkButton } from "@/components/ui/Button";
import { CustomerAvatar } from "@/components/ui/CustomerAvatar";
import { LoyaltyStampProgress } from "@/components/ui/LoyaltyStampProgress";
import { RewardCard } from "@/components/ui/RewardCard";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SuccessState } from "@/components/ui/SuccessState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CelebrationHalo,
  CoffeeCupIllustration,
  GiftBoxIllustration,
} from "@/components/Icons";

type ViewState = "detail" | "stamp_success" | "reward_unlocked";

function InfoRow({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-[0.76rem] font-semibold text-espresso-400">
        <span className="text-espresso-300 [&>svg]:size-3.5">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-[0.78rem] font-bold text-espresso-800",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Screens 4, 5, 6, 7, 8 and 10 — one component.
 *
 * The QR flow ("Customer Found") and Customer Lookup ("Customer Detail /
 * Redeem") render the exact same view, so the loyalty block, confirm sheet,
 * success state and redemption sheet can never drift apart.
 *
 * All writes go through FirebaseService:
 *   addStamp      → clients/{clientId}/stampTransactions/{id} + visit counting
 *                   + loyaltyAccounts/{customerId}
 *   redeemReward  → clients/{clientId}/rewardRedemptions/{id} + atomic reset
 */
export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ clientSlug: string; customerId: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;
  const customerId = resolvedParams.customerId;

  const { playChime, staffUser, client } = useStaffApp();

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [viewState, setViewState] = useState<ViewState>("detail");
  const [showConfirmStampModal, setShowConfirmStampModal] = useState(false);
  const [showRedeemConfirmModal, setShowRedeemConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    stamps: number;
    target: number;
    rewardUnlocked: boolean;
  } | null>(null);
  const stampOperationRef = useRef<{ customerId: string; id: string } | null>(null);
  const rewardOperationRef = useRef<{ customerId: string; id: string } | null>(null);

  const fetchCustomer = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      // Resolved inside the authenticated clientId — the route slug/customerId
      // can never widen access to another business.
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
  }, [customerId]);

  // Deferred a tick so the effect body never calls setState synchronously
  // (React Compiler rule) while the load still starts on mount.
  useEffect(() => {
    if (stampOperationRef.current?.customerId !== customerId) stampOperationRef.current = null;
    if (rewardOperationRef.current?.customerId !== customerId) rewardOperationRef.current = null;
    const handle = window.setTimeout(() => {
      void fetchCustomer();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [customerId, fetchCustomer]);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#D4A373", "#B97B32", "#3A1E0D", "#3F8F5C", "#E6B875"],
      });
    } catch {
      // Confetti is decorative only.
    }
  };

  /** Safe two-step atomic stamp transaction (screen 5 → 6/7). */
  const handleConfirmAddStamp = async () => {
    if (!customer || !staffUser || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const operationId =
        stampOperationRef.current?.customerId === customer.id
          ? stampOperationRef.current.id
          : FirebaseService.createIdempotencyKey("stamp");
      stampOperationRef.current = { customerId: customer.id, id: operationId };
      const data = await FirebaseService.addStamp(customer.id, operationId);

      if (data.success && data.customer) {
        stampOperationRef.current = null;
        setCustomer(data.customer);
        setLastResult({
          stamps: data.newStamps,
          target: data.stampTarget,
          rewardUnlocked: data.rewardUnlocked,
        });
        setShowConfirmStampModal(false);
        triggerConfetti();

        if (data.rewardUnlocked) {
          playChime("reward");
          setViewState("reward_unlocked");
        } else {
          playChime("stamp");
          setViewState("stamp_success");
        }
      } else {
        setShowConfirmStampModal(false);
        setError("Failed to add stamp.");
        playChime("error");
      }
    } catch (e: unknown) {
      const staffErr = toStaffServiceError(e, "UNKNOWN");
      console.error("[customer-detail] stamp failed:", describeErrorForDiagnostics(staffErr));
      setShowConfirmStampModal(false);
      setError(staffErr.message);
      playChime("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Atomic redemption in clients/{clientId}/rewardRedemptions/{id} (screen 8). */
  const handleConfirmRedeem = async () => {
    if (!customer || !staffUser || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const operationId =
        rewardOperationRef.current?.customerId === customer.id
          ? rewardOperationRef.current.id
          : FirebaseService.createIdempotencyKey("reward");
      rewardOperationRef.current = { customerId: customer.id, id: operationId };
      const data = await FirebaseService.redeemReward(customer.id, operationId);

      if (data.success && data.customer) {
        rewardOperationRef.current = null;
        setCustomer(data.customer);
        setShowRedeemConfirmModal(false);
        setViewState("detail");
        playChime("reward");
        triggerConfetti();
      } else {
        setShowRedeemConfirmModal(false);
        setError("Failed to redeem reward.");
        playChime("error");
      }
    } catch (e: unknown) {
      const staffErr = toStaffServiceError(e, "UNKNOWN");
      console.error("[customer-detail] redemption failed:", describeErrorForDiagnostics(staffErr));
      setShowRedeemConfirmModal(false);
      setError(staffErr.message);
      playChime("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------ */

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-md">
        <ScreenHeader title="Customer Details" backHref={`/staff/${clientSlug}/customers`} />
        <LoadingState label="Finding customer in store records…" />
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <ScreenHeader title="Customer Details" backHref={`/staff/${clientSlug}/customers`} />
        <EmptyState
          icon={<Users />}
          title="Customer not available"
          message={error}
          action={
            <LinkButton href={`/staff/${clientSlug}/customers`} size="sm" variant="secondary">
              Back to Customers
            </LinkButton>
          }
        />
      </div>
    );
  }

  if (!customer) return null;

  const stampTarget = customer.stampTarget || client?.stampTarget || 0;
  const stampsCount = customer.stamps;
  const isRewardReady = stampsCount >= stampTarget || customer.isEligibleForReward;
  const rewardTitle = customer.rewardName || client?.rewardName || "Reward not configured";
  const customerCode = customer.customerCode || customer.displayId || "—";
  const nextStamps = Math.min(stampsCount + 1, stampTarget);

  /* ================= SCREEN 6 — STAMP ADDED ================= */
  if (viewState === "stamp_success") {
    return (
      <div className="mx-auto w-full max-w-md">
        <ScreenHeader
          title="Stamp Added"
          backAsButton
          onBack={() => setViewState("detail")}
        />

        <SuccessState
          className="min-h-[70dvh]"
          graphic={
            <span className="relative flex size-32 items-center justify-center">
              <CelebrationHalo className="size-40" />
              <CoffeeCupIllustration className="relative size-28" />
            </span>
          }
          title="Stamp Added!"
          message={
            <>
              {customer.name.split(" ")[0]} now has{" "}
              <span className="font-extrabold text-espresso-900">
                {stampFraction(lastResult?.stamps ?? stampsCount, lastResult?.target ?? stampTarget)}
              </span>{" "}
              stamps
            </>
          }
          tone="cream"
        >
          <LoyaltyStampProgress
            stamps={lastResult?.stamps ?? stampsCount}
            stampTarget={lastResult?.target ?? stampTarget}
            rewardName={rewardTitle}
            showHeading={false}
            dense
            size="sm"
          />
        </SuccessState>

        <div className="space-y-2.5 px-1 pt-2">
          <Button size="lg" block onClick={() => setViewState("detail")}>
            View Customer
          </Button>
          <LinkButton
            href={`/staff/${clientSlug}/scan`}
            variant="secondary"
            size="lg"
            block
          >
            Back to Scan
          </LinkButton>
        </div>
      </div>
    );
  }

  /* ================= SCREEN 7 — REWARD UNLOCKED ================= */
  if (viewState === "reward_unlocked") {
    const unlockedTarget = lastResult?.target ?? stampTarget;

    return (
      <div className="mx-auto w-full max-w-md">
        <ScreenHeader
          title="Reward Unlocked"
          backAsButton
          onBack={() => setViewState("detail")}
        />

        <SuccessState
          className="min-h-[64dvh]"
          graphic={
            <span className="relative flex size-32 items-center justify-center">
              <CelebrationHalo className="size-40" />
              <GiftBoxIllustration className="relative size-28" />
            </span>
          }
          title="Reward Unlocked!"
          message={
            <>
              This customer has completed{" "}
              <span className="font-extrabold text-espresso-900">
                {stampFraction(unlockedTarget, unlockedTarget)}
              </span>{" "}
              stamps.
            </>
          }
        >
          <RewardCard
            ready
            rewardName={rewardTitle}
            status="Reward Ready for Redemption"
            description={client?.rewardDescription}
            imageUrl={client?.rewardImageUrl}
          />
        </SuccessState>

        <div className="space-y-2.5 px-1 pt-2">
          <Button
            size="lg"
            block
            disabled={isSubmitting}
            onClick={() => setShowRedeemConfirmModal(true)}
            iconRight={<ArrowRight className="text-caramel-300" />}
          >
            Mark as Redeemed
          </Button>
          <Button variant="secondary" size="lg" block onClick={() => setViewState("detail")}>
            View Customer
          </Button>
        </div>

        {/* SCREEN 8 — Redeem confirmation */}
        <RedeemModal
          open={showRedeemConfirmModal}
          customer={customer}
          customerCode={customerCode}
          rewardTitle={rewardTitle}
          rewardImageUrl={client?.rewardImageUrl}
          stampTarget={stampTarget}
          submitting={isSubmitting}
          onConfirm={() => void handleConfirmRedeem()}
          onCancel={() => setShowRedeemConfirmModal(false)}
        />
      </div>
    );
  }

  /* ============ SCREENS 4 & 10 — CUSTOMER DETAILS ============ */
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <ScreenHeader title="Customer Details" backHref={`/staff/${clientSlug}/customers`} />

      {error && (
        <ErrorState
          inline
          message={error}
          onRetry={() => void fetchCustomer()}
          retryLabel="Reload"
        />
      )}

      {/* Identity card */}
      <Card radius="xl" className="flex items-center gap-3.5 p-4">
        <CustomerAvatar name={customer.name} tint={customer.avatarBg} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[1.1rem] font-extrabold leading-tight text-espresso-900">
            {customer.name}
          </h2>
          <p className="mt-1 truncate text-[0.74rem] font-semibold text-espresso-400">
            {customerCode === "—" ? "Customer code unavailable" : `#${customerCode}`}
          </p>
          {/* Table information only when it exists in the actual data. */}
          {customer.tableNumber && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-xs bg-sand-100 px-1.5 py-0.5 text-[0.66rem] font-bold text-espresso-600">
              Table {customer.tableNumber}
            </p>
          )}
        </div>
        {isRewardReady && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-leaf-100 px-2 py-1 text-[0.64rem] font-extrabold uppercase tracking-wide text-leaf-700">
            <Gift className="size-3" aria-hidden="true" />
            Ready
          </span>
        )}
      </Card>

      {/* Loyalty block */}
      <Card radius="xl" className="space-y-4 p-4 sm:p-5">
        <LoyaltyStampProgress
          stamps={stampsCount}
          stampTarget={stampTarget}
          rewardName={rewardTitle}
        />

        {isRewardReady && (
          <RewardCard
            ready
            size="sm"
            rewardName={rewardTitle}
            status="Reward Ready for Redemption"
            imageUrl={client?.rewardImageUrl}
          />
        )}

        <div className="divide-y divide-line-soft border-t border-line-soft pt-1">
          <InfoRow
            icon={<Phone />}
            label="Phone"
            value={customer.phone || "—"}
          />
          <InfoRow
            icon={<Clock />}
            label="Last Stamp"
            value={customer.lastStampAt || "—"}
          />
          <InfoRow
            icon={<RotateCcw />}
            label="Lifetime Stamps"
            value={customer.lifetimeStamps === undefined ? "—" : customer.lifetimeStamps}
          />
          <InfoRow
            icon={<Gift />}
            label="Rewards Earned"
            value={customer.rewardsEarned === undefined ? "—" : customer.rewardsEarned}
          />
          <InfoRow
            icon={<Gift />}
            label="Rewards Redeemed"
            value={customer.rewardsRedeemed === undefined ? "—" : customer.rewardsRedeemed}
          />
          <InfoRow
            icon={<Users />}
            label="Total Visits"
            value={
              customer.totalVisits === undefined
                ? "—"
                : `${customer.totalVisits} ${customer.totalVisits === 1 ? "visit" : "visits"}`
            }
          />
          <InfoRow
            icon={<CalendarDays />}
            label="Customer Since"
            value={customer.visitingSince || customer.createdAt || "—"}
          />
          <InfoRow
            icon={<Clock />}
            label="Last Visit"
            value={customer.lastVisitAt || "—"}
          />
          <InfoRow
            icon={<ShieldCheck />}
            label="Reward Status"
            value={
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-1 text-[0.68rem] font-extrabold",
                  isRewardReady
                    ? "bg-leaf-100 text-leaf-700"
                    : "bg-sand-100 text-espresso-500"
                )}
              >
                {isRewardReady ? "Eligible for Reward" : "Not Eligible Yet"}
              </span>
            }
          />
        </div>
      </Card>

      {/* Primary action */}
      <div className="pt-1">
        {isRewardReady ? (
          <Button
            size="lg"
            block
            disabled={isSubmitting}
            onClick={() => setShowRedeemConfirmModal(true)}
            iconRight={<ArrowRight className="text-caramel-300" />}
          >
            Mark as Redeemed
          </Button>
        ) : (
          <Button
            size="lg"
            block
            disabled={isSubmitting || !client?.loyaltyEnabled}
            onClick={() => setShowConfirmStampModal(true)}
            iconLeft={<Gift className="text-caramel-300" />}
          >
            Add 1 Stamp
          </Button>
        )}
        {client && !client.loyaltyEnabled && !isRewardReady && (
          <p className="mt-2 text-center text-[0.7rem] font-medium text-espresso-400">
            The loyalty programme is disabled for this business.
          </p>
        )}
      </div>

      <Link
        href={`/staff/${clientSlug}/customers`}
        className="press-scale mx-auto flex w-fit items-center gap-1 text-[0.74rem] font-bold text-espresso-400 hover:text-espresso-700"
      >
        Back to Customer Lookup
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </Link>

      {/* ============ SCREEN 5 — CONFIRM STAMP ============ */}
      <ConfirmModal
        open={showConfirmStampModal}
        title="Add 1 Loyalty Stamp?"
        description={
          <>
            This adds one stamp to{" "}
            <span className="font-bold text-espresso-800">{customer.name}</span>&apos;s loyalty
            account and counts the visit.
          </>
        }
        hero={<CoffeeCupIllustration className="size-20" />}
        confirmLabel="Confirm"
        submitting={isSubmitting}
        onConfirm={() => void handleConfirmAddStamp()}
        onCancel={() => {
          if (isSubmitting) return;
          setShowConfirmStampModal(false);
        }}
      >
        <div className="rounded-lg border border-line bg-cream-100 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <CustomerAvatar name={customer.name} tint={customer.avatarBg} size="xs" />
              <span className="truncate text-[0.78rem] font-bold text-espresso-900">
                {customer.name}
              </span>
            </span>
            <span className="shrink-0 text-[0.78rem] font-semibold tabular-nums text-espresso-500">
              {stampFraction(stampsCount, stampTarget)}
              <ChevronRight className="mx-1 inline size-3 text-espresso-300" aria-hidden="true" />
              <span className="font-extrabold text-leaf-700">
                {stampFraction(nextStamps, stampTarget)}
              </span>
            </span>
          </div>
        </div>
      </ConfirmModal>

      {/* ============ SCREEN 8 — REDEEM REWARD ============ */}
      <RedeemModal
        open={showRedeemConfirmModal}
        customer={customer}
        customerCode={customerCode}
        rewardTitle={rewardTitle}
        rewardImageUrl={client?.rewardImageUrl}
        stampTarget={stampTarget}
        submitting={isSubmitting}
        onConfirm={() => void handleConfirmRedeem()}
        onCancel={() => setShowRedeemConfirmModal(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Redeem Reward confirmation (screen 8) — shared by screens 7 and 10.
 * ------------------------------------------------------------------ */
function RedeemModal({
  open,
  customer,
  customerCode,
  rewardTitle,
  rewardImageUrl,
  stampTarget,
  submitting,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  customer: CustomerProfile;
  customerCode: string;
  rewardTitle: string;
  rewardImageUrl?: string | null;
  stampTarget: number;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmModal
      open={open}
      title="Mark this reward as redeemed?"
      description={
        <>
          This will reset the customer&apos;s stamps to{" "}
          <span className="font-bold text-espresso-800">
            {stampFraction(0, stampTarget)}
          </span>{" "}
          after redemption.
        </>
      }
      confirmLabel="Confirm Redemption"
      submitting={submitting}
      onConfirm={onConfirm}
      onCancel={() => {
        if (submitting) return;
        onCancel();
      }}
    >
      <div className="rounded-lg border border-line bg-cream-100 p-3">
        <div className="flex items-center gap-2.5">
          <CustomerAvatar name={customer.name} tint={customer.avatarBg} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[0.82rem] font-bold text-espresso-900">{customer.name}</p>
            <p className="truncate text-[0.7rem] font-medium text-espresso-400">
              {customerCode === "—" ? "Customer code unavailable" : `Customer #${customerCode}`}
            </p>
          </div>
        </div>
      </div>

      <RewardCard
        size="sm"
        rewardName={rewardTitle}
        status="Reward"
        imageUrl={rewardImageUrl}
      />
    </ConfirmModal>
  );
}
