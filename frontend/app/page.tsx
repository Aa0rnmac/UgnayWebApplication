"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { login } from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        </div>

        {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
      </form>
    </section>
  );
}
