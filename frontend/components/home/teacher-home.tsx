"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-context";
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
    label: "Review module submissions",
    detail:
      "Open module submissions to score upload assessments, add feedback, and track learner output quality.",
  },
] as const;

export function TeacherHome() {
  const { displayName } = useAuth();
  const [snapshot, setSnapshot] = useState<TeacherWorkspaceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const teacherName = displayName.trim() || "Teacher";

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
      ]
    : [];

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Teacher Workspace
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            Welcome, Teacher <span className="text-brandBlue">{teacherName}</span>!
          </h1>
          <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
            Run enrollment, monitor learning signals, and coach practice from one teacher
            workspace.
          </h2>
          <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
            The teacher surface is now backed by the real enrollment, batch, reporting, and lab
            contracts. This home view is your live operations cockpit, not a mock planning board.
          </p>
        </div>
      </div>

      {snapshot ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card, index) => (
            <TeacherWorkspaceCard key={card.title} themeIndex={index} {...card} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading teacher workspace snapshot...</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Recommended Next Move
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="teacher-card-copy text-sm leading-relaxed">
              {snapshot?.nextStep ??
                "Teacher operations are loading. This card will suggest the highest-impact follow-up next."}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">Tracked Students</p>
              <p className="teacher-card-title mt-2 text-3xl font-black">
                {snapshot?.trackedStudents ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">Saved Attempts</p>
              <p className="teacher-card-title mt-2 text-3xl font-black">
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
                <p className="teacher-card-title text-sm font-black">
                  0{index + 1}. {step.label}
                </p>
                <p className="teacher-card-copy mt-2 text-xs leading-relaxed">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
