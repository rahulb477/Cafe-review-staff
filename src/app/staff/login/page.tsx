"use client";

import React, { Suspense, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { CafeLogo } from "@/components/Icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";

const fieldClass =
  "h-12 w-full rounded-lg border border-line bg-cream-100 pl-10 pr-4 text-base font-medium " +
  "text-espresso-900 placeholder-espresso-300 shadow-hairline transition-colors " +
  "focus:border-espresso-300 focus:bg-cream-50 focus:outline-none focus:ring-2 " +
  "focus:ring-espresso-800/15 disabled:opacity-60 sm:text-sm";

/**
 * Screen 1 — Staff Login.
 *
 * Visual only: Firebase Authentication, the staffUsers/{uid} → clientId →
 * clients/{clientId} resolution and every error message are unchanged.
 */
function StaffLoginContent() {
  const { login, client, authError, status, isLoading: isSessionLoading } = useStaffApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);

  const isBusy = isSubmitting || status === "authorizing";

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isBusy) return;

    if (!email.trim()) {
      setErrorMessage("Please enter your staff email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const res = await login(email.trim(), password);
      if (!res.success) {
        setErrorMessage(res.error || "Authentication failed. Please verify your credentials.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred during login.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Only a *resolved* authorization failure may be displayed. While Firebase
   * Auth is still initializing or while staffUsers/{uid} + clients/{clientId}
   * are loading, the session status is "initializing"/"authorizing" and no
   * error is rendered (the button shows its loading state instead).
   */
  const sessionError = status === "error" ? authError : null;
  const displayError = errorMessage || sessionError;

  const brandName = client?.name || "Staff Portal";
  const brandTagline = client?.tagline || "Loyalty & Rewards";

  return (
    <div className="flex min-h-dvh flex-col bg-linen pt-safe pb-safe">
      {/* Warm café header band */}
      <div className="cafe-motif relative overflow-hidden bg-espresso-800 pb-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(520px 260px at 50% -10%, rgba(212,163,115,0.28), transparent 72%)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-6 pt-12 text-center">
          <CafeLogo
            name={brandName}
            logoUrl={client?.logoUrl}
            logoText={client?.logoText}
            inverse
            className="size-16"
          />
          <h1 className="mt-3.5 text-[1.4rem] font-extrabold tracking-tight text-cream-50">
            {brandName}
          </h1>
          <p className="mt-1.5 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-caramel-300">
            {brandTagline}
          </p>
        </div>
      </div>

      {/* Login card overlapping the warm band */}
      <div className="relative z-10 mx-auto -mt-10 w-full max-w-md flex-1 px-4 sm:px-6">
        <Card radius="2xl" className="animate-rise p-5 shadow-raise sm:p-7">
          <div className="text-center">
            <h2 className="text-[1.3rem] font-extrabold tracking-tight text-espresso-900">
              Staff Login
            </h2>
            <p className="mx-auto mt-1.5 max-w-[19rem] text-[0.78rem] font-medium leading-relaxed text-espresso-400">
              Sign in with your staff credentials to add loyalty stamps and redeem rewards.
            </p>
          </div>

          {displayError && (
            <div
              role="alert"
              className="animate-fade-in mt-5 flex items-start gap-2.5 rounded-lg border border-alert-100 bg-alert-50 p-3"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-alert-600" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[0.76rem] font-semibold leading-relaxed text-alert-700">
                {displayError}
              </p>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-5 space-y-3.5">
            <div>
              <label
                htmlFor="staff-email"
                className="mb-1.5 block text-[0.72rem] font-bold text-espresso-600"
              >
                Email / Staff ID
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-espresso-300">
                  <Mail className="size-4" aria-hidden="true" />
                </span>
                <input
                  id="staff-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@cafe.com"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={isBusy}
                  className={cn(fieldClass, "pr-10")}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="staff-password"
                className="mb-1.5 block text-[0.72rem] font-bold text-espresso-600"
              >
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-espresso-300">
                  <Lock className="size-4" aria-hidden="true" />
                </span>
                <input
                  id="staff-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={isBusy}
                  className={cn(fieldClass, "pr-11")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="press-scale absolute inset-y-0 right-0 flex items-center pr-3.5 text-espresso-300 hover:text-espresso-600"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              block
              loading={isBusy}
              loadingLabel="Signing in…"
              iconRight={<ArrowRight className="text-caramel-300" />}
              className="mt-1.5"
            >
              Sign In
            </Button>

            <div className="pt-0.5 text-center">
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="press-scale text-[0.76rem] font-bold text-espresso-500 underline-offset-4 hover:text-espresso-800 hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        </Card>

        {/* Security footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 pb-2">
          <ShieldCheck className="size-4 text-espresso-400" aria-hidden="true" />
          <span className="text-[0.72rem] font-semibold text-espresso-400">
            {isSessionLoading && status === "initializing"
              ? "Connecting to Firebase…"
              : "Secure Staff Access"}
          </span>
        </div>
      </div>

      {/* Forgot password — staff credentials are managed by the business admin. */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="animate-fade-in absolute inset-0 bg-espresso-950/55"
            onClick={() => setShowForgotModal(false)}
            aria-hidden="true"
          />
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            radius="2xl"
            className="animate-sheet-up relative z-10 w-full max-w-sm rounded-b-none px-5 py-6 text-center shadow-sheet sm:rounded-2xl"
          >
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              aria-label="Close"
              className="press-scale absolute top-3.5 right-3.5 inline-flex size-8 items-center justify-center rounded-full text-espresso-400 hover:bg-sand-100 hover:text-espresso-800"
            >
              <X className="size-4" aria-hidden="true" />
            </button>

            <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-caramel-100 text-caramel-600">
              <UserRound className="size-6" aria-hidden="true" />
            </span>
            <h3 id="forgot-title" className="text-[1.05rem] font-extrabold text-espresso-900">
              Staff Password Recovery
            </h3>
            <p className="mx-auto mt-2 max-w-[19rem] text-[0.78rem] font-medium leading-relaxed text-espresso-500">
              Staff accounts are managed in Firebase Authentication. Please contact your store
              manager or administrator to reset your credentials.
            </p>
            <Button className="mt-5" size="lg" block onClick={() => setShowForgotModal(false)}>
              Return to Sign In
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-linen pt-safe pb-safe">
          <LoadingState label="Preparing staff login…" />
        </div>
      }
    >
      <StaffLoginContent />
    </Suspense>
  );
}
