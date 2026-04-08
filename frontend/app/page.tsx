"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useAuth } from "@/components/auth-context";
import { AuthSwitcher } from "@/components/auth-switcher";

export default function LoginPage() {
  const router = useRouter();
  const { loading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const user = await login(username.trim(), password);
      router.push(user.role === "teacher" ? "/teacher" : "/dashboard");
      router.refresh();
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
        <h2 className="text-3xl font-bold title-gradient">Sign In</h2>
        <p className="mt-2 text-sm text-muted">
          Sign in with your assigned account, open student registration, or create a teacher
          account with the school-issued passkey. Demo access is still available below for quick
          previews.
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
            disabled={loading || submitting}
            type="submit"
          >
            {submitting ? "Logging in..." : "Login"}
          </button>

          <Link
            className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/register"
          >
            Student Registration
          </Link>
          <Link
            className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/register/teacher"
          >
            Teacher Registration
          </Link>
        </div>

        <p className="text-xs text-muted">
          Teachers need the current registration passkey from the coordinator or administrator.
        </p>

        {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
      </form>

      <div className="panel panel-lively">
        <p className="text-xs uppercase tracking-wider label-accent">Demo Access</p>
        <p className="mt-2 text-sm text-muted">
          Use the built-in demo profiles if you want to preview both role experiences quickly.
        </p>
        <div className="mt-4">
          <AuthSwitcher />
        </div>
      </div>
    </section>
  );
}
