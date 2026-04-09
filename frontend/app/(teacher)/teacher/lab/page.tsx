"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SigningLab } from "@/components/lab/signing-lab";
import { TeacherLabWorkspaceData, getTeacherLabData } from "@/lib/teacher-data";

function readinessTone(readiness: "ready" | "attention") {
  return readiness === "ready"
    ? "border-brandGreen/40 bg-brandGreenLight text-brandGreen"
    : "border-brandYellow/40 bg-brandYellowLight text-brandNavy";
}

export default function TeacherLabPage() {
  const [data, setData] = useState<TeacherLabWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeacherLabData()
      .then(setData)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  const attentionStatuses = useMemo(
    () => data?.statuses.filter((status) => status.readiness === "attention") ?? [],
    [data]
  );

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Teacher Lab
            </p>
            <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
              Coach practical signing through the live recognition lanes connected to the backend.
            </h2>
            <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
              Use this workspace to rehearse activity flow, verify model readiness, and support
              teacher-guided practical checks before or after students submit attempts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
              href="/teacher/modules"
            >
              Open Modules
            </Link>
            <Link
              className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white"
              href="/lab"
            >
              Open Shared Route
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Modes Ready
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {data ? `${data.summary.readyModes}/3` : "0/3"}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Recognition lanes currently ready for teacher-guided practice.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Module Guides
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {data?.summary.guidedModules ?? 0}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Teacher-visible modules mapped to their best lab lane.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Needs Attention
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {data?.summary.attentionModes ?? 0}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Lanes that still need caution before they are used heavily in class.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
            Shared Mode Readiness
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            {data?.statuses.map((status) => (
              <div
                key={status.mode}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="teacher-card-title text-sm font-black">{status.title}</p>
                    <p className="teacher-card-meta mt-1 text-xs">{status.summary}</p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${readinessTone(status.readiness)}`}
                  >
                    {status.readiness}
                  </span>
                </div>
                <p className="teacher-card-copy mt-3 text-sm leading-relaxed">{status.detail}</p>
                <p className="teacher-card-meta mt-3 text-xs">{status.selectorHint}</p>
              </div>
            )) ?? (
              <div className="teacher-card-copy rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                Loading shared lab readiness...
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Teacher Action Notes
          </p>
          <div className="mt-4 space-y-3">
            {attentionStatuses.length ? (
              attentionStatuses.map((status) => (
                <div
                  key={status.mode}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="teacher-card-title text-sm font-black">{status.title}</p>
                  <p className="teacher-card-copy mt-2 text-sm">{status.detail}</p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Standard practice: keep this lane teacher-guided until the remaining model or
                    label work is stable enough for everyday classroom use.
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="teacher-card-title text-sm font-black">All live lab modes are ready.</p>
                <p className="teacher-card-copy mt-2 text-sm">
                  Teachers can use the same live practice surface students use and support practical
                  coaching without extra setup.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
          Module Practice Map
        </p>
          <p className="teacher-panel-copy mt-3 max-w-3xl text-sm leading-relaxed">
          Each teacher-visible module is mapped to the best live lab lane so coaching stays aligned
          with the backend activity and recognition setup.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data?.guides.map((guide) => (
            <div key={guide.moduleId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="teacher-card-title text-sm font-black">{guide.moduleTitle}</p>
                  <p className="teacher-card-meta mt-1 text-xs uppercase tracking-[0.2em]">
                    {guide.labModeLabel}
                  </p>
                </div>
                <Link
                  className="teacher-card-ghost-button rounded-lg border px-3 py-2 text-xs font-semibold transition"
                  href={`/teacher/modules/${guide.moduleId}`}
                >
                  Open Module
                </Link>
              </div>
              <p className="teacher-card-copy mt-3 text-sm">{guide.selectorHint}</p>
              <p className="teacher-card-meta mt-2 text-xs leading-relaxed">{guide.prepFocus}</p>
            </div>
          )) ?? (
            <div className="teacher-card-copy rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
              Loading module practice guidance...
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
              Recognition Tester
            </p>
            <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
              The testing surface below is teacher-focused. Use it to dry-run gestures, confirm the
              active label set, and spot low-confidence predictions before assigning practical work.
            </p>
          </div>
          <Link
            className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition"
            href="/lab"
          >
            Open Student Lab
          </Link>
        </div>
      </div>

      <SigningLab variant="teacher" />

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-300">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
