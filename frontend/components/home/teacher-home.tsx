"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";
import { TeacherWorkspaceSnapshot, getTeacherWorkspaceSnapshot } from "@/lib/teacher-data";

const WORKFLOW_STEPS = [
  {
    label: "Approve enrollment requests",
    detail:
      "Start with pending registrants, confirm their payment proof, and place approved learners into the right batch.",
  },
  {
    label: "Watch the teaching signals",
    detail:
      "Use the summary view to see weak activity items and which students need extra teacher attention right now.",
  },
  {
    label: "Inspect learner detail",
    detail:
      "Open any student profile to review batch placement, module progress, and item-by-item activity answers.",
  },
  {
    label: "Coach practical work live",
    detail:
      "Use the lab to rehearse signs and verify whether each practical activity lane is stable enough for classroom use.",
  },
] as const;

export function TeacherHome() {
  const [snapshot, setSnapshot] = useState<TeacherWorkspaceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeacherWorkspaceSnapshot()
      .then(setSnapshot)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  const cards = snapshot
    ? [
        {
          eyebrow: "Enrollment operations",
          title: `${snapshot.pendingEnrollments} Pending Requests`,
          description: `${snapshot.approvedStudents} students are already approved across ${snapshot.totalBatches} batches.`,
          badge: "ENR",
          href: "/teacher/classes",
          ctaLabel: "Open Enrollment Queue",
        },
        {
          eyebrow: "Curriculum visibility",
          title: `${snapshot.liveModules} Live Modules`,
          description:
            snapshot.draftModules > 0
              ? `${snapshot.draftModules} draft module slots are visible for teacher review.`
              : "All teacher-visible modules are already in a live state.",
          badge: "MOD",
          href: "/teacher/modules",
          ctaLabel: "Open Modules",
        },
        {
          eyebrow: "Teaching watchlist",
          title: `${snapshot.attentionStudents} Students Need Attention`,
          description: `${snapshot.weakItems} weak activity items and ${snapshot.totalAttempts} saved attempts are available for review.`,
          badge: "RPT",
          href: "/teacher/progress",
          ctaLabel: "Open Progress View",
        },
        {
          eyebrow: "Practical recognition",
          title: `${snapshot.readyLabModes}/${snapshot.totalLabModes} Lab Modes Ready`,
          description:
            snapshot.labAttentionModes > 0
              ? `${snapshot.labAttentionModes} live lab lane still needs teacher caution.`
              : "All live lab lanes are ready for guided practical coaching.",
          badge: "LAB",
          href: "/teacher/lab",
          ctaLabel: "Open Lab Workspace",
        },
      ]
    : [];

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Teacher Workspace
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">
              Run enrollment, monitor learning signals, and coach practice from one teacher
              workspace.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The teacher surface is now backed by the real enrollment, batch, reporting, and lab
              contracts. This home view is your live operations cockpit, not a mock planning board.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
              href="/teacher/classes"
            >
              Review Enrollments
            </Link>
            <Link
              className="rounded-full bg-brandGreen px-4 py-2 text-xs font-semibold text-white"
              href="/teacher/progress"
            >
              Open Watchlist
            </Link>
            <Link
              className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white"
              href="/teacher/lab"
            >
              Open Lab
            </Link>
          </div>
        </div>
      </div>

      {snapshot ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, index) => (
            <TeacherWorkspaceCard key={card.title} themeIndex={index} {...card} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <p className="text-sm text-slate-300">Loading teacher workspace snapshot...</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Recommended Next Move
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm leading-relaxed text-slate-200">
              {snapshot?.nextStep ??
                "Teacher operations are loading. This card will suggest the highest-impact follow-up next."}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Tracked Students</p>
              <p className="mt-2 text-3xl font-black text-brandWhite">
                {snapshot?.trackedStudents ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Saved Attempts</p>
              <p className="mt-2 text-3xl font-black text-brandWhite">
                {snapshot?.totalAttempts ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
            Delivery Flow
          </p>
          <div className="mt-4 space-y-3">
            {WORKFLOW_STEPS.map((step, index) => (
              <div key={step.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black text-brandWhite">
                  0{index + 1}. {step.label}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-300">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
