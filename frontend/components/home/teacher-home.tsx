"use client";

import { ReactNode, useEffect, useState } from "react";

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
  metadataSlot?: ReactNode;
};

export function TeacherHome() {
  const { displayName, role } = useAuth();
  const [snapshot, setSnapshot] = useState<TeacherWorkspaceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRoleLabel = role === "admin" ? "Admin" : "Teacher";
  const teacherName = displayName.trim() || panelRoleLabel;

  useEffect(() => {
    getTeacherWorkspaceSnapshot()
      .then(setSnapshot)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  const cards: TeacherHomeCard[] = snapshot
    ? [
        {
          eyebrow: "Teacher overview",
          title: "MY ACTIVE MODULES, MY STUDENTS, MY BATCH",
          description: "Quick glance at your live teaching scope.",
          badge: "OVERVIEW",
          href: "/teacher/class-management",
          ctaLabel: "Open Teacher Overview",
          appearance: "default",
          metadataSlot: (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Modules
                </p>
                <p className="mt-1 text-sm font-black text-slate-900">{snapshot.liveModules}</p>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Students
                </p>
                <p className="mt-1 text-sm font-black text-slate-900">{snapshot.trackedStudents}</p>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Batches
                </p>
                <p className="mt-1 text-sm font-black text-slate-900">{snapshot.totalBatches}</p>
              </div>
            </div>
          ),
        },
      ]
    : [];

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            {panelRoleLabel} Workspace
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            Welcome, {panelRoleLabel} <span className="text-brandBlue">{teacherName}</span>!
          </h1>
          <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
            Summary of your active modules, active students, issued certificates.
          </h2>
        </div>
      </div>

      {snapshot ? (
        <div className="max-w-xl">
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
