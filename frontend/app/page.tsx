"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  confirmForgotPasswordOtp,
  issueTeacherCredentials,
  login,
  resetForgotPassword,
  requestForgotPasswordOtp,
  verifyTeacherInvitePasskey,
  verifyTeacherInviteQr,
} from "@/lib/api";
import { isStrongPassword } from "@/lib/validation";

type TeacherStep = "scan" | "passkey" | "email" | "done";
type ForgotPasswordStep = "request" | "otp" | "reset";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentity, setForgotIdentity] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotStep, setForgotStep] = useState<ForgotPasswordStep>("request");
  const [forgotResetToken, setForgotResetToken] = useState("");
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  const [teacherOpen, setTeacherOpen] = useState(false);
  const [teacherStep, setTeacherStep] = useState<TeacherStep>("scan");
  const [teacherMessage, setTeacherMessage] = useState<string | null>(null);
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const [teacherSubmitting, setTeacherSubmitting] = useState(false);
  const [qrCameraOpen, setQrCameraOpen] = useState(false);
  const [qrCaptureScanning, setQrCaptureScanning] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [passkey, setPasskey] = useState("");
  const [showTeacherPasskey, setShowTeacherPasskey] = useState(false);
  const [onboardingToken, setOnboardingToken] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [issuedUsername, setIssuedUsername] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopQrCamera();
    };
  }, []);

  function stopQrCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setQrCameraOpen(false);
  }

  function resetTeacherFlow() {
    stopQrCamera();
    setTeacherStep("scan");
    setTeacherMessage(null);
    setTeacherError(null);
    setTeacherSubmitting(false);
    setQrCaptureScanning(false);
    setInviteCode("");
    setPasskey("");
    setShowTeacherPasskey(false);
    setOnboardingToken("");
    setTeacherEmail("");
    setIssuedUsername("");
  }

  function openTeacherFlow() {
    resetTeacherFlow();
    setTeacherOpen(true);
  }

  function closeTeacherFlow() {
    setTeacherOpen(false);
    resetTeacherFlow();
  }

  async function verifyQrPayloadFlow(payload: string) {
    setTeacherSubmitting(true);
    setTeacherError(null);
    setTeacherMessage(null);
    try {
      const response = await verifyTeacherInviteQr(payload);
      setInviteCode(response.invite_code);
      setTeacherMessage(response.message);
      setTeacherStep("passkey");
      stopQrCamera();
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "Unable to verify QR.";
      setTeacherError(message);
    } finally {
      setTeacherSubmitting(false);
    }
  }

  async function openQrCamera() {
    setTeacherMessage(null);
    setTeacherError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setQrCameraOpen(true);
      setTeacherMessage("Camera ready. Capture the QR now.");
    } catch {
      setTeacherError("Unable to open camera. Allow permission in browser settings.");
    }
  }

  async function captureQrFromCamera() {
    if (!videoRef.current) {
      setTeacherError("Camera preview is not ready.");
      return;
    }

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setTeacherError("Failed to capture image from camera.");
      return;
    }
    context.drawImage(video, 0, 0, width, height);

    setQrCaptureScanning(true);
    setTeacherError(null);
    setTeacherMessage("Scanning captured QR image...");

    let objectUrl: string | null = null;
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92);
      });
      if (!blob) {
        setTeacherMessage(null);
        setTeacherError("Unable to capture QR image.");
        return;
      }

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      objectUrl = URL.createObjectURL(blob);
      const result = await reader.decodeFromImageUrl(objectUrl);
      const payload = result.getText()?.trim();
      if (!payload) {
        setTeacherMessage(null);
        setTeacherError("No QR code detected in captured image.");
        return;
      }
      await verifyQrPayloadFlow(payload);
    } catch {
      setTeacherMessage(null);
      setTeacherError("Unable to read QR. Reposition card and capture again.");
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setQrCaptureScanning(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await login(username.trim(), password);
      window.localStorage.setItem("auth_token", response.token);
      window.localStorage.setItem("auth_username", response.user.username);
      window.location.href = response.user.role === "teacher" ? "/teacher" : "/dashboard";
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
      setForgotStep("otp");
      setForgotMessage(response.message);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to request OTP code.";
      setForgotError(message);
    } finally {
      setForgotSubmitting(false);
    }
  }

  async function onConfirmOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotSubmitting(true);
    setForgotError(null);
    setForgotMessage(null);

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setForgotSubmitting(false);
      setForgotError("OTP code must be exactly 6 digits.");
      return;
    }

    try {
      const response = await confirmForgotPasswordOtp(forgotIdentity.trim(), otpCode.trim());
      setForgotResetToken(response.reset_token);
      setForgotStep("reset");
      setForgotMessage(response.message);
    } catch (verifyError) {
      const message =
        verifyError instanceof Error ? verifyError.message : "Failed to verify OTP code.";
      setForgotError(message);
    } finally {
      setForgotSubmitting(false);
    }
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotSubmitting(true);
    setForgotError(null);
    setForgotMessage(null);

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
      const response = await resetForgotPassword(forgotResetToken, newPassword);
      window.localStorage.setItem("auth_token", response.token);
      window.localStorage.setItem("auth_username", response.user.username);
      window.location.href = response.user.role === "teacher" ? "/teacher" : "/dashboard";
    } catch (verifyError) {
      const message =
        verifyError instanceof Error ? verifyError.message : "Failed to reset password.";
      setForgotError(message);
    } finally {
      setForgotSubmitting(false);
    }
  }

  function resetForgotPasswordFlow() {
    setForgotStep("request");
    setForgotIdentity("");
    setOtpCode("");
    setNewPassword("");
    setConfirmPassword("");
    setForgotResetToken("");
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
    setForgotError(null);
    setForgotMessage(null);
  }

  async function onTeacherPasskeySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTeacherSubmitting(true);
    setTeacherError(null);
    setTeacherMessage(null);
    try {
      const response = await verifyTeacherInvitePasskey(inviteCode, passkey.trim());
      setOnboardingToken(response.onboarding_token);
      setTeacherMessage(response.message);
      setTeacherStep("email");
    } catch (passkeyError) {
      const message = passkeyError instanceof Error ? passkeyError.message : "Invalid passkey.";
      setTeacherError(message);
    } finally {
      setTeacherSubmitting(false);
    }
  }

  async function onTeacherEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTeacherSubmitting(true);
    setTeacherError(null);
    setTeacherMessage(null);
    try {
      const response = await issueTeacherCredentials(onboardingToken, teacherEmail.trim());
      setIssuedUsername(response.username);
      setTeacherMessage("Credentials sent to teacher email successfully.");
      setTeacherStep("done");
    } catch (issueError) {
      const message =
        issueError instanceof Error ? issueError.message : "Unable to issue teacher credentials.";
      setTeacherError(message);
    } finally {
      setTeacherSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <h2 className="text-3xl font-bold title-gradient">Log In Portal</h2>
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
          <div className="mt-1 flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showLoginPassword ? "text" : "password"}
              value={password}
            />
            <button
              className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
              onClick={() => setShowLoginPassword((value) => !value)}
              type="button"
            >
              {showLoginPassword ? "Hide" : "Show"}
            </button>
          </div>
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
              if (forgotOpen) {
                resetForgotPasswordFlow();
              } else {
                setForgotError(null);
                setForgotMessage(null);
              }
            }}
            type="button"
          >
            {forgotOpen ? "Close Forgot Password" : "Forgot Password?"}
          </button>

          <button
            className="ml-auto rounded-lg border border-brandBlue bg-brandBlueLight px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight/70"
            onClick={openTeacherFlow}
            type="button"
          >
            Scan QR
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
      </form>

      {forgotOpen ? (
        <div className="panel panel-lively space-y-4">
          <h3 className="text-xl font-semibold text-slate-900">Forgot Password</h3>
          <p className="text-sm text-slate-700">
            Enter your username or email to receive a 6-digit OTP code. Verify the OTP first, then
            create your new password.
          </p>

          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brandBlue">
            Step {forgotStep === "request" ? "1" : forgotStep === "otp" ? "2" : "3"} of 3
          </p>

          <form
            className="space-y-3"
            onSubmit={
              forgotStep === "request"
                ? onRequestOtp
                : forgotStep === "otp"
                  ? onConfirmOtp
                  : onResetPassword
            }
          >
            <label className="block text-sm font-semibold text-slate-800">
              Username or Email
              <input
                className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                disabled={forgotStep !== "request"}
                onChange={(event) => setForgotIdentity(event.target.value)}
                required
                type="text"
                value={forgotIdentity}
              />
            </label>

            {forgotStep === "otp" ? (
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
            ) : null}

            {forgotStep === "reset" ? (
              <>
                <label className="block text-sm font-semibold text-slate-800">
                  New Password
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                      type={showForgotNewPassword ? "text" : "password"}
                      value={newPassword}
                    />
                    <button
                      className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                      onClick={() => setShowForgotNewPassword((value) => !value)}
                      type="button"
                    >
                      {showForgotNewPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <label className="block text-sm font-semibold text-slate-800">
                  Confirm New Password
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      type={showForgotConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                    />
                    <button
                      className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                      onClick={() => setShowForgotConfirmPassword((value) => !value)}
                      type="button"
                    >
                      {showForgotConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
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
                  ? forgotStep === "request"
                    ? "Sending OTP..."
                    : forgotStep === "otp"
                      ? "Verifying OTP..."
                      : "Resetting Password..."
                  : forgotStep === "request"
                    ? "Send OTP Code"
                    : forgotStep === "otp"
                      ? "Verify OTP"
                      : "Reset Password and Continue"}
              </button>

              {forgotStep !== "request" ? (
                <button
                  className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                  disabled={forgotSubmitting}
                  onClick={() => {
                    if (forgotStep === "reset") {
                      setForgotStep("otp");
                      setForgotResetToken("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setShowForgotNewPassword(false);
                      setShowForgotConfirmPassword(false);
                    } else {
                      setForgotStep("request");
                      setOtpCode("");
                    }
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

      {teacherOpen && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 pt-20 md:pt-24">
          <div className="w-full max-w-xl rounded-2xl border border-brandBorder bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Teacher Onboarding</h3>
              <button
                className="rounded border border-brandBorder bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-brandMutedSurface"
                onClick={closeTeacherFlow}
                type="button"
              >
                Close
              </button>
            </div>

            <p className="mt-2 text-sm text-slate-700">
              Step {teacherStep === "scan" ? "1" : teacherStep === "passkey" ? "2" : teacherStep === "email" ? "3" : "Done"} of 3
            </p>

            {teacherStep === "scan" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-600">
                  Tap Open Camera, then Capture QR. The captured frame will be scanned automatically.
                </p>

                <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-900">
                  {qrCameraOpen ? (
                    <video
                      autoPlay
                      className="h-64 w-full object-cover"
                      muted
                      playsInline
                      ref={videoRef}
                    />
                  ) : (
                    <div className="grid h-64 place-items-center px-4 text-center text-sm text-slate-300">
                      Camera is off. Tap Open Camera to start QR capture.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={teacherSubmitting || qrCaptureScanning}
                    onClick={() => {
                      void openQrCamera();
                    }}
                    type="button"
                  >
                    Open Camera
                  </button>
                  <button
                    className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!qrCameraOpen || teacherSubmitting || qrCaptureScanning}
                    onClick={() => {
                      void captureQrFromCamera();
                    }}
                    type="button"
                  >
                    {qrCaptureScanning ? "Scanning..." : "Capture QR"}
                  </button>
                  <button
                    className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!qrCameraOpen || teacherSubmitting || qrCaptureScanning}
                    onClick={stopQrCamera}
                    type="button"
                  >
                    Close Camera
                  </button>
                </div>
              </div>
            ) : null}

            {teacherStep === "passkey" ? (
              <form className="mt-4 space-y-3" onSubmit={onTeacherPasskeySubmit}>
                <label className="block text-sm font-semibold text-slate-800">
                  Passkey
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                      onChange={(event) => setPasskey(event.target.value)}
                      required
                      type={showTeacherPasskey ? "text" : "password"}
                      value={passkey}
                    />
                    <button
                      className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                      onClick={() => setShowTeacherPasskey((value) => !value)}
                      type="button"
                    >
                      {showTeacherPasskey ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={teacherSubmitting}
                    type="submit"
                  >
                    {teacherSubmitting ? "Verifying..." : "Verify Passkey"}
                  </button>
                  <button
                    className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                    onClick={() => {
                      setTeacherStep("scan");
                      setPasskey("");
                      setTeacherError(null);
                      setTeacherMessage(null);
                    }}
                    type="button"
                  >
                    Back
                  </button>
                </div>
              </form>
            ) : null}

            {teacherStep === "email" ? (
              <form className="mt-4 space-y-3" onSubmit={onTeacherEmailSubmit}>
                <label className="block text-sm font-semibold text-slate-800">
                  Teacher Email
                  <input
                    className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                    onChange={(event) => setTeacherEmail(event.target.value)}
                    required
                    type="email"
                    value={teacherEmail}
                  />
                </label>
                <button
                  className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={teacherSubmitting}
                  type="submit"
                >
                  {teacherSubmitting ? "Sending..." : "Send Initial Credentials"}
                </button>
              </form>
            ) : null}

            {teacherStep === "done" ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-lg border border-brandGreen/35 bg-brandGreenLight px-3 py-2 text-sm text-slate-800">
                  Teacher account created. Credentials were sent to email.
                </p>
                <p className="text-sm text-slate-700">
                  Issued username: <span className="font-semibold">{issuedUsername}</span>
                </p>
                <button
                  className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
                  onClick={closeTeacherFlow}
                  type="button"
                >
                  Done
                </button>
              </div>
            ) : null}

            {teacherMessage ? (
              <p className="mt-3 rounded-lg border border-brandBlue/30 bg-brandBlueLight px-3 py-2 text-sm text-slate-800">
                {teacherMessage}
              </p>
            ) : null}
            {teacherError ? (
              <p className="mt-3 rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-sm text-brandRed">
                {teacherError}
              </p>
            ) : null}
          </div>
        </div>,
          document.body
        )
        : null}
    </section>
  );
}
