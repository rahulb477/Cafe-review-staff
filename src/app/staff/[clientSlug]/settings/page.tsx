"use client";

import React, { use } from "react";
import { Check, LogOut, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card, SectionHeading } from "@/components/ui/Card";
import { CustomerAvatar } from "@/components/ui/CustomerAvatar";
import { Button } from "@/components/ui/Button";

function SettingRow({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-sand-100 text-espresso-700 [&>svg]:size-[1.1rem]"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.84rem] font-bold text-espresso-900">
            {title}
          </span>
          <span className="mt-0.5 block text-[0.72rem] font-medium leading-snug text-espresso-400">
            {description}
          </span>
        </span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-[0.76rem] font-semibold text-espresso-400">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-[0.78rem] font-bold text-espresso-800",
          mono && "font-mono text-[0.72rem] font-semibold"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Staff & app settings. Business details are read-only and always come from
 * staffUsers/{uid}.clientId → clients/{clientId}; there is no way to switch
 * business from this screen or anywhere else in the app.
 */
export default function StaffSettingsPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;

  const { client, staffUser, clientId, soundEnabled, setSoundEnabled, logout } = useStaffApp();

  const staffName = staffUser?.name || "Staff Member";

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <ScreenHeader title="Settings" backHref={`/staff/${clientSlug}`} />

      {/* Staff identity */}
      <Card radius="xl" className="flex items-center gap-3.5 p-4">
        <CustomerAvatar name={staffName} tint="#e7d8c5" size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[1rem] font-extrabold leading-tight text-espresso-900">
            {staffName}
          </h2>
          <p className="mt-0.5 truncate text-[0.74rem] font-medium text-espresso-400">
            {staffUser?.email || "No email available"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-xs bg-sand-100 px-2 py-0.5 text-[0.64rem] font-bold text-espresso-600">
              {staffUser?.role || "Staff Member"}
            </span>
            {staffUser?.staffId && (
              <span className="font-mono text-[0.64rem] font-semibold text-espresso-300">
                {staffUser.staffId}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Preferences */}
      <section className="space-y-2.5">
        <SectionHeading title="Preferences" />
        <Card radius="xl" className="divide-y divide-line-soft px-4 py-1">
          <SettingRow
            icon={soundEnabled ? <Volume2 /> : <VolumeX />}
            title="Audio chime feedback"
            description="Play a short chime on scan, stamp and reward"
          >
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-label="Audio chime feedback"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(
                "press-scale relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5",
                soundEnabled ? "bg-espresso-800" : "bg-sand-300"
              )}
            >
              <span
                className={cn(
                  "size-5 rounded-full bg-cream-50 shadow-hairline transition-transform duration-200",
                  soundEnabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </SettingRow>
        </Card>
      </section>

      {/* Assigned business + loyalty configuration (read-only) */}
      <section className="space-y-2.5">
        <SectionHeading title="Assigned Business" />
        <Card radius="xl" className="divide-y divide-line-soft px-4 py-1">
          <DetailRow label="Business" value={client?.name || "Not configured"} />
          <DetailRow label="Client ID" value={clientId || "Not available"} mono />
          <DetailRow
            label="Stamp target"
            value={client ? `${client.stampTarget} stamps` : "Not configured"}
          />
          <DetailRow label="Reward" value={client?.rewardName || "Not configured"} />
          <DetailRow
            label="Loyalty programme"
            value={client ? (client.loyaltyEnabled ? "Enabled" : "Disabled") : "Not available"}
          />
        </Card>
        <p className="px-1 text-[0.7rem] font-medium leading-relaxed text-espresso-300">
          Your staff account belongs to a single business, resolved from your Firebase staff
          record. It cannot be switched from the app.
        </p>
      </section>

      {/* Security */}
      <section className="space-y-2.5">
        <SectionHeading title="Security" />
        <Card radius="xl" className="space-y-3 p-4">
          <h3 className="flex items-center gap-1.5 text-[0.8rem] font-bold text-espresso-900">
            <ShieldCheck className="size-4 text-leaf-600" aria-hidden="true" />
            Firestore staff isolation
          </h3>
          <ul className="space-y-2 text-[0.74rem] font-medium leading-relaxed text-espresso-500">
            {[
              <>
                Authenticated UID resolves to <code className="font-mono">staffUsers/{"{uid}"}</code>{" "}
                → <code className="font-mono">clientId</code> →{" "}
                <code className="font-mono">clients/{"{clientId}"}</code>.
              </>,
              <>
                Stamps are stored in{" "}
                <code className="font-mono">clients/{"{clientId}"}/stampTransactions</code> and
                redemptions in{" "}
                <code className="font-mono">clients/{"{clientId}"}/rewardRedemptions</code>.
              </>,
              <>
                Visits are counted in an atomic two-step write with idempotency, so a double tap
                can never add two stamps.
              </>,
              <>
                QR codes are verified against your business before any customer data is read.
              </>,
            ].map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-leaf-600" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Button variant="danger" size="lg" block iconLeft={<LogOut />} onClick={() => void logout()}>
        Sign Out
      </Button>
    </div>
  );
}
