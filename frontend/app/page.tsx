"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { login, requestForgotPasswordOtp, verifyForgotPasswordOtp } from "@/lib/api";
import { isStrongPassword } from "@/lib/validation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentity, setForgotIdentity] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await login(username.trim(), password);
      window.localStorage.setItem("auth_token", response.token);
      window.localStorage.setItem("auth_username", response.user.username);
      window.location.href = "/dashboard";
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Login failed.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotSubmitting(true);
    setForgotError(null);
    setForgotMessage(null);

    try {
      const response = await requestForgotPasswordOtp(forgotIdentity.trim());
      setOtpRequested(true);
      setForgotMessage(response.message);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to request OTP code.";
      setForgotError(message);
    } finally {
      setForgotSubmitting(false);
    }
  }

  async function onVerifyOtpAndReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotSubmitting(true);
    setForgotError(null);
    setForgotMessage(null);

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setForgotSubmitting(false);
      setForgotError("OTP code must be exactly 6 digits.");
      return;
    }

    if (!isStrongPassword(newPassword)) {
      setForgotSubmitting(false);
      setForgotError(
        "New password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 symbol."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setForgotSubmitting(false);
      setForgotError("New password and confirm password do not match.");
      return;
    }

    try {
      const response = await verifyForgotPasswordOtp(
        forgotIdentity.trim(),
        otpCode.trim(),
        newPassword
      );
      window.localStorage.setItem("auth_token", response.token);
      window.localStorage.setItem("auth_username", response.user.username);
      window.location.href = "/dashboard";
    } catch (verifyError) {
      const message =
        verifyError instanceof Error ? verifyError.message : "Failed to verify OTP code.";
      setForgotError(message);
    } finally {
      setForgotSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <h2 className="text-3xl font-bold title-gradient">Student Login</h2>
        <p className="mt-2 text-sm text-muted">
          Login using the initial credentials sent by your teacher after payment reference
          validation.
        </p>
      </div>

      <form className="panel panel-lively space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-semibold text-slate-800">
          Username
          <input
            className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setUsername(event.target.value)}
            required
            type="text"
            value={username}
          />
        </label>

        <label className="block text-sm font-semibold text-slate-800">
          Password
          <input
            className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Logging in..." : "Login"}
          </button>

          <Link
            className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/register"
          >
            Open Registration
          </Link>

          <button
            className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            onClick={() => {
              setForgotOpen((open) => !open);
              setForgotError(null);
              setForgotMessage(null);
            }}
            type="button"
          >
            {forgotOpen ? "Close Forgot Password" : "Forgot Password?"}
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
      </form>

      {forgotOpen ? (
        <div className="panel panel-lively space-y-4">
          <h3 className="text-xl font-semibold text-slate-900">Forgot Password</h3>
          <p className="text-sm text-slate-700">
            Enter your username or email to receive a 6-digit OTP code. After verification, your
            password will be reset and you will be logged in automatically.
          </p>

          <form className="space-y-3" onSubmit={otpRequested ? onVerifyOtpAndReset : onRequestOtp}>
            <label className="block text-sm font-semibold text-slate-800">
              Username or Email
              <input
                className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                onChange={(event) => setForgotIdentity(event.target.value)}
                required
                type="text"
                value={forgotIdentity}
              />
            </label>

            {otpRequested ? (
              <>
                <label className="block text-sm font-semibold text-slate-800">
                  OTP Code
                  <input
                    className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setOtpCode(event.target.value)}
                    required
                    type="text"
                    value={otpCode}
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-800">
                  New Password
                  <input
                    className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    type="password"
                    value={newPassword}
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-800">
                  Confirm New Password
                  <input
                    className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </label>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={forgotSubmitting}
                type="submit"
              >
                {forgotSubmitting
                  ? otpRequested
                    ? "Verifying..."
                    : "Sending OTP..."
                  : otpRequested
                    ? "Verify OTP and Continue"
                    : "Send OTP Code"}
              </button>

              {otpRequested ? (
                <button
                  className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                  disabled={forgotSubmitting}
                  onClick={() => {
                    setOtpRequested(false);
                    setOtpCode("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setForgotError(null);
                    setForgotMessage(null);
                  }}
                  type="button"
                >
                  Back
                </button>
              ) : null}
            </div>
          </form>

          {forgotMessage ? (
            <p className="rounded-lg border border-brandGreen/35 bg-brandGreenLight px-3 py-2 text-sm text-slate-800">
              {forgotMessage}
            </p>
          ) : null}
          {forgotError ? (
            <p className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-sm text-brandRed">
              {forgotError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
