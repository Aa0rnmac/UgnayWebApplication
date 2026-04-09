"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ModuleItem,
  TeacherBatch,
  TeacherGeneratedStudentReport,
  TeacherReportSummary,
  TeacherStudentReportRow,
  generateTeacherStudentReport,
  getModules,
  getTeacherBatches,
  getTeacherReportSummary,
  getTeacherStudentReportRows,
} from "@/lib/api";

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "No data";
  return `${value.toFixed(digits)}%`;
}

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

export default function TeacherProgressPage() {
  const [summary, setSummary] = useState<TeacherReportSummary | null>(null);
  const [batches, setBatches] = useState<TeacherBatch[]>([]);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [studentRows, setStudentRows] = useState<TeacherStudentReportRow[]>([]);
  const [generatedReport, setGeneratedReport] = useState<TeacherGeneratedStudentReport | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStaticData() {
    try {
      const [nextBatches, nextModules, nextStudents] = await Promise.all([
        getTeacherBatches(),
        getModules(),
        getTeacherStudentReportRows(),
      ]);
      setBatches(nextBatches);
      setModules(nextModules);
      setStudentRows(nextStudents);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load teacher reports.");
    }
  }

  async function loadSummary(batchId?: number | null, moduleId?: number | null) {
    setLoading(true);
    setError(null);
    try {
      const nextSummary = await getTeacherReportSummary({ batchId, moduleId });
      setSummary(nextSummary);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load teacher summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStaticData();
  }, []);

  useEffect(() => {
    const batchId = selectedBatchId ? Number(selectedBatchId) : null;
    const moduleId = selectedModuleId ? Number(selectedModuleId) : null;
    void loadSummary(batchId, moduleId);
  }, [selectedBatchId, selectedModuleId]);

  async function handleGenerate(studentId: number) {
    setBusyStudentId(studentId);
    setError(null);
    try {
      const report = await generateTeacherStudentReport(studentId);
      setGeneratedReport(report);
      setStudentRows(await getTeacherStudentReportRows());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to generate printable student summary."
      );
    } finally {
      setBusyStudentId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
          Teacher Progress
        </p>
        <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
          Spot weak items, attention students, and concern attempts from saved activity data.
        </h2>
        <p className="teacher-panel-copy mt-3 max-w-3xl text-sm leading-relaxed">
          This view is now driven by the new teacher summary backend. Filter by batch or module to
          see which activity items need review and which students may need extra teaching support.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            className="teacher-card-control"
            onChange={(event) => setSelectedBatchId(event.target.value)}
            value={selectedBatchId}
          >
            <option value="">All batches</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </select>
          <select
            className="teacher-card-control"
            onChange={(event) => setSelectedModuleId(event.target.value)}
            value={selectedModuleId}
          >
            <option value="">All modules</option>
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                Module {module.order_index}: {module.title}
              </option>
            ))}
          </select>
          <button
            className="teacher-card-ghost-button rounded-xl border px-3 py-2 text-sm font-semibold transition"
            onClick={() => {
              setSelectedBatchId("");
              setSelectedModuleId("");
            }}
            type="button"
          >
            Clear Filters
          </button>
          <Link
            className="rounded-xl bg-brandBlue px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-brandBlue/90"
            href="/teacher/classes"
          >
            Open Enrollments
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Students</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{summary?.total_students ?? 0}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Tracked learners in the current filter view.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Attempts</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{summary?.total_attempts ?? 0}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Saved activity attempts available for review.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">Average</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {formatPercent(summary?.average_score_percent ?? 0, 2)}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">Average score across the filtered attempt set.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">Watchlist</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {(summary?.students_needing_attention.length ?? 0) + (summary?.weak_items.length ?? 0)}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">Combined teaching alerts from weak items and students.</p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading teacher summary...</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Weak Items
          </p>
          <div className="mt-4 space-y-3">
            {summary?.weak_items.length ? (
              summary.weak_items.map((item) => (
                <div key={`${item.activity_key}-${item.item_key}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="teacher-card-title text-sm font-black">{item.activity_title}</p>
                  <p className="teacher-card-meta mt-1 text-xs">{item.module_title}</p>
                  <p className="teacher-card-copy mt-3 text-sm">{item.prompt ?? item.expected_answer ?? item.item_key}</p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Wrong rate {formatPercent(item.wrong_rate_percent, 2)} across {item.attempt_count} attempts
                  </p>
                </div>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No weak items matched the current filter.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
            Students Needing Attention
          </p>
          <div className="mt-4 space-y-3">
            {summary?.students_needing_attention.length ? (
              summary.students_needing_attention.map((student) => (
                <div key={student.student_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="teacher-card-title text-sm font-black">{student.student_name}</p>
                  <p className="teacher-card-meta mt-1 text-xs">
                    {student.batch_name ?? "Unassigned batch"} · {student.attempt_count} attempts
                  </p>
                  <p className="teacher-card-copy mt-3 text-sm">
                    Average {formatPercent(student.average_score_percent, 2)} · {student.low_score_count} low score(s) in the latest five attempts
                  </p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Latest attempt {formatDateTime(student.latest_attempt_at)}
                  </p>
                  <Link
                    className="mt-4 inline-flex rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
                    href={`/teacher/students/${student.student_id}`}
                  >
                    Open Student
                  </Link>
                </div>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No students are currently flagged by the attention rules.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Concern Attempts
          </p>
          <div className="mt-4 space-y-3">
            {summary?.recent_concern_attempts.length ? (
              summary.recent_concern_attempts.map((attempt) => (
                <div key={attempt.attempt_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="teacher-card-title text-sm font-black">{attempt.student_name}</p>
                  <p className="teacher-card-meta mt-1 text-xs">
                    {attempt.module_title} · {attempt.activity_title}
                  </p>
                  <p className="teacher-card-copy mt-3 text-sm">
                    Score {formatPercent(attempt.score_percent, 2)} · {attempt.low_confidence_item_count} low-confidence item(s)
                  </p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Submitted {formatDateTime(attempt.submitted_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No recent concern attempts matched the current filter.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Printable Summary Queue
            </p>
            <button
              className="teacher-card-ghost-button rounded-lg border px-3 py-2 text-xs font-semibold transition"
              onClick={() => {
                void loadStaticData();
              }}
              type="button"
            >
              Refresh Queue
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {studentRows.length ? (
              studentRows.map((student) => (
                <div key={student.student_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="teacher-card-title text-sm font-black">{student.student_name}</p>
                      <p className="teacher-card-meta mt-1 text-xs">
                        {student.student_email ?? "No email on record"}
                      </p>
                    </div>
                    <button
                      className="rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90 disabled:opacity-60"
                      disabled={busyStudentId === student.student_id}
                      onClick={() => void handleGenerate(student.student_id)}
                      type="button"
                    >
                      {busyStudentId === student.student_id ? "Generating..." : "Generate"}
                    </button>
                  </div>
                  <p className="teacher-card-copy mt-3 text-sm">
                    {student.total_assessments} assessment(s) · average {formatPercent(student.average_score_percent, 2)}
                  </p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Latest activity {formatDateTime(student.latest_activity_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No legacy report rows are available yet.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
            Latest Generated Summary
          </p>
          {generatedReport ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-title text-xl font-black">{generatedReport.student_name}</p>
              <p className="teacher-card-meta text-sm">
                Generated {formatDateTime(generatedReport.generated_at)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                  <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">Overall Score</p>
                  <p className="teacher-card-title mt-2 text-2xl font-black">
                    {formatPercent(generatedReport.overall_score_percent, 2)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                  <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">Assessments</p>
                  <p className="teacher-card-title mt-2 text-2xl font-black">
                    {generatedReport.total_assessments}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {generatedReport.top_improvement_areas.length ? (
                  generatedReport.top_improvement_areas.slice(0, 5).map((item) => (
                    <div key={item.area} className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="teacher-card-title text-sm font-semibold">{item.area}</p>
                      <p className="teacher-card-meta mt-1 text-xs">Flagged {item.count} time(s)</p>
                    </div>
                  ))
                ) : (
                  <p className="teacher-card-copy text-sm">No improvement areas were recorded yet.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
              Generate a printable summary from the queue to preview it here.
            </div>
          )}
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
