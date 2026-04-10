"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-context";
import {
  TeacherWorkspaceCard,
  type TeacherWorkspaceCardAppearance,
} from "@/components/teacher/workspace-card";
import { TeacherWorkspaceSnapshot, getTeacherWorkspaceSnapshot } from "@/lib/teacher-data";

type TeacherHomeCard = {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  href: string;
  ctaLabel: string;
  appearance: TeacherWorkspaceCardAppearance;
};

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

  const cards: TeacherHomeCard[] = snapshot
    ? [
        {
          eyebrow: "Enrollment operations",
          title: `${snapshot.pendingEnrollments} Pending Requests`,
          description: `${snapshot.approvedStudents} students are already approved across ${snapshot.totalBatches} batches.`,
          badge: "ENROLLMENT",
          href: "/teacher/classes",
          ctaLabel: "Open Enrollment Queue",
          appearance: snapshot.pendingEnrollments > 0 ? "attention" : "default",
        },
        {
          eyebrow: "Curriculum visibility",
          title: `${snapshot.liveModules} Live Modules`,
          description:
            snapshot.draftModules > 0
              ? `${snapshot.draftModules} draft module slots are visible for teacher review.`
              : "All teacher-visible modules are already in a live state.",
          badge: "MODULES",
          href: "/teacher/modules",
          ctaLabel: "Open Modules",
          appearance: "default",
        },
        {
          eyebrow: "Teaching watchlist",
          title: `${snapshot.attentionStudents} Students Need Attention`,
          description: `${snapshot.weakItems} weak activity items and ${snapshot.totalAttempts} saved attempts are available for review.`,
          badge: "REPORT",
          href: "/teacher/progress",
          ctaLabel: "Open Progress View",
          appearance: "default",
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
          appearance: "default",
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
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, index) => (
            <TeacherWorkspaceCard key={card.title} themeIndex={index} {...card} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading teacher workspace snapshot...</p>
        </div>
      )}

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
