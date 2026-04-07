"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getModules, ModuleItem } from "@/lib/api";

const HERO_TIPS = [
  "Tip: Do short daily practice. Five focused minutes beats one long random session.",
  "Tip: Keep handshape clear first, then increase speed little by little.",
  "Tip: Use the lab after each module lesson to lock in memory."
] as const;

const MODULE_GRADIENTS = [
  "from-brandYellowLight via-white to-brandYellowLight/45",
  "from-brandBlueLight via-white to-brandBlueLight/45",
  "from-brandRedLight via-white to-brandRedLight/45",
  "from-brandGreenLight via-white to-brandGreenLight/45"
] as const;

function progressTone(percent: number) {
  if (percent >= 100) {
    return "text-brandGreen";
  }
  if (percent > 0) {
    return "text-brandYellow";
  }
  return "text-brandRed";
}

function progressBarTone(percent: number) {
  if (percent >= 100) {
    return "bg-brandGreen";
  }
  if (percent > 0) {
    return "bg-brandYellow";
  }
  return "bg-brandRed";
}

export default function DashboardPage() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getModules()
      .then(setModules)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const total = modules.length;
    const completed = modules.filter((module) => module.progress_percent >= 100).length;
    const inProgress = modules.filter(
      (module) => module.progress_percent > 0 && module.progress_percent < 100
    ).length;
    return { total, completed, inProgress };
  }, [modules]);

  const nextModule =
    modules.find((module) => module.progress_percent < 100) ??
    modules[0] ??
    null;

  return (
    <section className="space-y-6">
      <div className="panel panel-lively relative overflow-hidden">
        <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-brandBlueLight blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-14 h-36 w-36 rounded-full bg-brandYellowLight blur-2xl" />
        <div className="relative">
          <h2 className="text-3xl font-bold title-gradient">Dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Welcome back. Track your progress, jump into practice quickly, and keep your FSL
            learning streak active.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brandBlue/90"
              onClick={() => setTipIndex((index) => (index + 1) % HERO_TIPS.length)}
              type="button"
            >
              New Study Tip
            </button>
            <span className="rounded-lg border border-brandBorder bg-brandBlueLight/45 px-3 py-2 text-xs font-medium text-slate-700">
              {HERO_TIPS[tipIndex]}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="panel panel-lively">
          <p className="text-xs uppercase tracking-wider label-accent">Total Activities</p>
          <p className="mt-2 text-3xl font-black text-brandBlue">{summary.total}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs uppercase tracking-wider label-accent">Completed</p>
          <p className="mt-2 text-3xl font-black text-brandGreen">{summary.completed}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs uppercase tracking-wider label-accent">In Progress</p>
          <p className="mt-2 text-3xl font-black text-brandYellow">{summary.inProgress}</p>
        </article>
      </div>

      <div className="panel panel-lively">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-wider label-accent">Quick Access</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="rounded-lg bg-brandRed px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brandRed/90"
              href="/modules"
            >
              Open Modules
            </Link>
            <Link
              className="rounded-lg bg-brandYellow px-4 py-2 text-xs font-semibold text-brandNavy transition hover:-translate-y-0.5 hover:bg-brandYellow/90"
              href="/lab"
            >
              Open Lab
            </Link>
            {nextModule ? (
              <Link
                className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-xs font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-brandBlueLight/65"
                href={`/modules/${nextModule.id}`}
              >
                Continue Next Module
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="text-sm text-muted">Loading module highlights...</p>
        ) : (
          modules.map((module, index) => (
            <Link
              className="block h-full focus-visible:outline-none"
              href={`/modules/${module.id}`}
              key={module.id}
            >
              <article
                className={`panel panel-lively flex h-full min-h-[190px] flex-col border-brandBorder bg-gradient-to-br ${MODULE_GRADIENTS[index % MODULE_GRADIENTS.length]}`}
              >
                <p className="text-xs uppercase tracking-wider label-accent">
                  Module {module.order_index}
                </p>
                <h3 className="mt-2 min-h-[4.5rem] text-2xl font-black leading-tight text-slate-900">
                  {module.title.replace(/^Module \d+:\s*/i, "")}
                </h3>
                <div className="mt-auto pt-3">
                  <p className={`text-sm font-semibold ${progressTone(module.progress_percent)}`}>
                    Progress: {module.progress_percent}%
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${progressBarTone(module.progress_percent)}`}
                      style={{ width: `${Math.max(5, module.progress_percent)}%` }}
                    />
                  </div>
                </div>
              </article>
            </Link>
          ))
        )}
      </div>

      {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
    </section>
  );
}
