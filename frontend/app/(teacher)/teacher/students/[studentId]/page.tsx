"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  TeacherActivityAttempt,
  TeacherStudent,
  getTeacherStudent,
  getTeacherStudentActivityAttempts,
} from "@/lib/api";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No activity yet";
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "No data";
  return `${value.toFixed(digits)}%`;
}

export default function TeacherStudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = Number(params.studentId);

  const [student, setStudent] = useState<TeacherStudent | null>(null);
  const [attempts, setAttempts] = useState<TeacherActivityAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(studentId)) {
      setError("Invalid student id.");
      return;
    }

    setLoading(true);
    setError(null);
    Promise.all([getTeacherStudent(studentId), getTeacherStudentActivityAttempts(studentId)])
      .then(([studentResponse, attemptsResponse]) => {
        setStudent(studentResponse);
        setAttempts(attemptsResponse);
      })
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  const attemptSummary = useMemo(() => {
    if (!attempts.length) {
      return { average: 0, latestAt: null as string | null, modulesTouched: 0 };
    }

    const modulesTouched = new Set(attempts.map((attempt) => attempt.module_id)).size;
    return {
      average: attempts.reduce((total, attempt) => total + attempt.score_percent, 0) / attempts.length,
      latestAt: attempts[0]?.submitted_at ?? null,
      modulesTouched,
    };
  }, [attempts]);

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Student Detail
            </p>
            <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
              {student?.full_name ?? "Student profile"}
            </h2>
            <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
              Review student information, batch placement, module progress, and item-by-item
              answers from saved activity attempts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
              href="/teacher/classes"
            >
              Back to Enrollments
            </Link>
            <Link
              className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white"
              href="/teacher/progress"
            >
              Back to Progress
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Batch</p>
          <p className="teacher-panel-value mt-3 text-2xl font-black">
            {student?.batch?.name ?? "Unassigned"}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Attempts</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{attempts.length}</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">Average</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {formatPercent(attemptSummary.average, 2)}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">Latest</p>
          <p className="teacher-panel-value mt-3 text-sm font-black">
            {formatDateTime(attemptSummary.latestAt)}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading student detail...</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.88fr,1.12fr]">
        <div className="space-y-4">
          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
              Student Information
            </p>
            <div className="teacher-card-copy mt-4 space-y-3 text-sm">
              <p><span className="teacher-card-title font-semibold">Username:</span> {student?.username ?? "Not set"}</p>
              <p><span className="teacher-card-title font-semibold">Email:</span> {student?.email ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Phone:</span> {student?.phone_number ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Birth date:</span> {student?.birth_date ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Address:</span> {student?.address ?? "Not provided"}</p>
              <p><span className="teacher-card-title font-semibold">Enrollment status:</span> {student?.enrollment_status ?? "Not set"}</p>
            </div>
          </div>

          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
              Module Progress
            </p>
            <div className="mt-4 space-y-3">
              {student?.module_progress.length ? (
                student.module_progress.map((item) => (
                  <div key={item.module_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="teacher-card-title text-sm font-black">{item.module_title}</p>
                      <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                        {item.status}
                      </span>
                    </div>
                    <p className="teacher-card-copy mt-3 text-sm">
                      Progress {item.progress_percent}% · assessment {formatPercent(item.assessment_score, 2)}
                    </p>
                    <p className="teacher-card-meta mt-2 text-xs">
                      Updated {formatDateTime(item.updated_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                  No module progress has been saved for this student yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Activity Answers
            </p>
            <p className="teacher-card-meta text-xs">
              {attemptSummary.modulesTouched} module(s) touched
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {attempts.length ? (
              attempts.map((attempt) => (
                <details key={attempt.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="teacher-card-title text-sm font-black">{attempt.activity_title}</p>
                        <p className="teacher-card-meta mt-1 text-xs">
                          {attempt.module_title} · {attempt.activity_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="teacher-card-title text-sm font-black">
                          {formatPercent(attempt.score_percent, 2)}
                        </p>
                        <p className="teacher-card-meta mt-1 text-xs">
                          {attempt.right_count}/{attempt.total_items} correct
                        </p>
                      </div>
                    </div>
                    <p className="teacher-card-meta mt-3 text-xs">
                      Submitted {formatDateTime(attempt.submitted_at)}
                    </p>
                  </summary>

                  {attempt.improvement_areas.length ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brandBlue">
                        Improvement Areas
                      </p>
                      <p className="teacher-card-copy mt-2 text-sm">
                        {attempt.improvement_areas.join(", ")}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {attempt.items.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <p className="teacher-card-title text-sm font-semibold">
                            {item.prompt ?? item.item_key}
                          </p>
                          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                            {item.is_correct === true
                              ? "Correct"
                              : item.is_correct === false
                                ? "Needs review"
                                : "Ungraded"}
                          </span>
                        </div>
                        <p className="teacher-card-copy mt-3 text-sm">
                          Expected: {item.expected_answer ?? "Not provided"}
                        </p>
                        <p className="teacher-card-copy mt-1 text-sm">
                          Student answer: {item.student_answer ?? "No answer"}
                        </p>
                        <p className="teacher-card-meta mt-2 text-xs">
                          Confidence {item.confidence !== null ? `${(item.confidence * 100).toFixed(1)}%` : "Not captured"}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No saved activity attempts are available for this student yet.
              </div>
            )}
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
