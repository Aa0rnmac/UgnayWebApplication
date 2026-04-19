"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getTeacherDashboard, type TeacherSectionSummary } from "@/lib/api";

export default function TeacherDashboardPage() {
  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [studentListSection, setStudentListSection] = useState<TeacherSectionSummary | null>(null);

  useEffect(() => {
    getTeacherDashboard().then(setSections).catch((requestError: Error) => setError(requestError.message));
  }, []);

  const totalStudents = sections.reduce((total, section) => total + section.section.student_count, 0);
  const totalPublishedModules = sections.reduce((total, section) => total + section.published_module_count, 0);
  const totalDraftModules = sections.reduce((total, section) => total + section.draft_module_count, 0);
  const totalModuleCount = totalPublishedModules + totalDraftModules;
  const topSectionsByStudents = [...sections]
    .sort((left, right) => right.section.student_count - left.section.student_count)
    .slice(0, 3);
  const publishedShare = totalModuleCount > 0 ? (totalPublishedModules / totalModuleCount) * 100 : 0;

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Teacher Dashboard</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Dashboard</h2>
        <p className="mt-2 text-sm text-slate-700">
          Quick Access To build modules, monitor student progress, and review reports.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Batches</p>
          <p className="mt-3 text-4xl font-black text-brandBlue">{sections.length}</p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Students</p>
          <p className="mt-3 text-4xl font-black text-brandGreen">
            {totalStudents}
          </p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Published Modules</p>
          <p className="mt-3 text-4xl font-black text-accentWarm">
            {totalPublishedModules}
          </p>
        </div>
        <div className="panel panel-lively">
          <p className="text-xs uppercase tracking-[0.22em] label-accent">Draft Modules</p>
          <p className="mt-3 text-4xl font-black text-brandRed">
            {totalDraftModules}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Module Status</p>
          <p className="mt-2 mb-4 text-sm text-slate-700">Published and draft module count.</p>
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
            <div
              aria-label="Published versus draft modules"
              className="relative h-44 w-44 rounded-full border border-brandBorder"
              style={{
                background: `conic-gradient(var(--brand-green, #2e7d32) 0% ${publishedShare}%, var(--brand-red, #dc3545) ${publishedShare}% 100%)`
              }}
            >
              <div className="absolute inset-5 rounded-full bg-white shadow-sm" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="mb-0 text-xs uppercase tracking-[0.2em] text-slate-500">Total</p>
                <p className="mb-0 text-2xl font-bold text-brandBlue">{totalModuleCount}</p>
              </div>
            </div>
            <div className="w-full space-y-2">
              <div className="d-flex items-center justify-between rounded-xl border border-brandBorder bg-brandOffWhite px-3 py-2 text-sm">
                <span className="font-semibold text-slate-800">Published</span>
                <span className="text-slate-700">{totalPublishedModules}</span>
              </div>
              <div className="d-flex items-center justify-between rounded-xl border border-brandBorder bg-brandOffWhite px-3 py-2 text-sm">
                <span className="font-semibold text-slate-800">Draft</span>
                <span className="text-slate-700">{totalDraftModules}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Counts Of Student Every Batches</p>
          <p className="mt-2 mb-4 text-sm text-slate-700">Top 3 batches by student count.</p>
          <div className="space-y-3">
            {topSectionsByStudents.length === 0 ? (
              <p className="mb-0 rounded-xl border border-brandBorder bg-white px-3 py-2 text-sm text-slate-600">
                No batch data yet.
              </p>
            ) : (
              topSectionsByStudents.map((entry) => {
                const share = totalStudents > 0 ? Math.round((entry.section.student_count / totalStudents) * 100) : 0;
                return (
                  <div key={entry.section.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-800">{entry.section.name}</span>
                      <span className="text-slate-600">{entry.section.student_count} students</span>
                    </div>
                    <div className="h-2 rounded-full bg-brandBlueLight">
                      <div className="h-full rounded-full bg-brandBlue" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
            <p className="mt-4 mb-0 rounded-xl border border-brandRed/30 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed">
              NOTE: Use short, clear instructions in each module item so students can follow without help.
            </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((entry) => (
          <article className="panel panel-lively" key={entry.section.id}>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{entry.section.code}</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{entry.section.name}</h3>
            <p className="mt-2 text-sm text-slate-700">{entry.section.description || "No batch description yet."}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-brandOffWhite px-3 py-3 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Students</p>
                <p className="mt-2 font-semibold">{entry.section.student_count}</p>
              </div>
              <div className="rounded-xl bg-brandOffWhite px-3 py-3 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Published</p>
                <p className="mt-2 font-semibold">{entry.published_module_count}</p>
              </div>
              <div className="rounded-xl bg-brandOffWhite px-3 py-3 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Batch Status</p>
                <p className="mt-2 font-semibold capitalize">{entry.section.status}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" href={`/teacher/modules?section=${entry.section.id}`}>
                Open Modules
              </Link>
              <Link className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue" href={`/teacher/reports?studentSection=${entry.section.id}`}>
                View Reports
              </Link>
              <button
                className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setStudentListSection(entry)}
                type="button"
              >
                View Students
              </button>
            </div>
          </article>
        ))}
      </div>

      {studentListSection ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Students - {studentListSection.section.name}</h5>
                <button
                  aria-label="Close"
                  className="btn-close"
                  onClick={() => setStudentListSection(null)}
                  type="button"
                />
              </div>
              <div className="modal-body">
                {studentListSection.section.students.length === 0 ? (
                  <p className="mb-0 text-sm text-slate-700">No students assigned yet.</p>
                ) : (
                  <ul className="mb-0 list-group">
                    {studentListSection.section.students.map((student) => {
                      const displayName =
                        [student.first_name, student.last_name].filter(Boolean).join(" ").trim() ||
                        student.username;
                      return (
                        <li className="list-group-item" key={student.id}>
                          {displayName}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={() => setStudentListSection(null)} type="button">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
