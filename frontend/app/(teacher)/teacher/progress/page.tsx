"use client";

import { useEffect, useMemo, useState } from "react";

import {
  TeacherAnalyticsOverview,
  TeacherBatch,
  TeacherModuleItem,
  getTeacherAnalyticsOverview,
  getTeacherBatches,
  getTeacherModuleCatalog,
} from "@/lib/api";
import { getUploadBase } from "@/lib/api-base";

type FilterState = {
  batchId: string;
  moduleId: string;
  studentId: string;
};

type StudentOption = {
  user_id: number;
  username: string;
  full_name: string;
  batch_id: number;
  batch_name: string;
};

const DASHBOARD_LIMITS = {
  wrong_items_limit: 6,
  low_score_limit: 8,
  recent_limit: 8,
  snapshot_limit: 6,
  suggestion_limit: 4,
} as const;

function toOptionalNumber(value: string): number | undefined {
  if (!value || value === "all") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) {
    return "No data";
  }
  return `${value.toFixed(digits)}%`;
}

function formatScoreFraction(correct: number, total: number) {
  return `${correct}/${total}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "No attempts yet";
  }
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function scoreTone(score: number) {
  if (score < 75) {
    return "bg-accent/20 text-accentWarm border border-accent/30";
  }
  if (score >= 90) {
    return "bg-brandGreen/20 text-brandGreen border border-brandGreen/30";
  }
  return "bg-brandBlue/20 text-brandBlue border border-brandBlue/30";
}

function priorityTone(priority: string) {
  if (priority === "high") {
    return "bg-accent/20 text-accentWarm border border-accent/30";
  }
  if (priority === "medium") {
    return "bg-brandBlue/20 text-brandBlue border border-brandBlue/30";
  }
  return "bg-brandGreen/20 text-brandGreen border border-brandGreen/30";
}

function buildScopeLabel({
  batchName,
  moduleTitle,
  studentName,
}: {
  batchName?: string | null;
  moduleTitle?: string | null;
  studentName?: string | null;
}) {
  return [
    batchName ?? "All batches",
    moduleTitle ?? "All modules",
    studentName ?? "All students",
  ].join(" / ");
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}

export default function TeacherProgressPage() {
  const [batches, setBatches] = useState<TeacherBatch[]>([]);
  const [modules, setModules] = useState<TeacherModuleItem[]>([]);
  const [analytics, setAnalytics] = useState<TeacherAnalyticsOverview | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    batchId: "all",
    moduleId: "all",
    studentId: "all",
  });
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadOptions() {
      setLoadingOptions(true);
      setError(null);
      try {
        const [batchData, moduleData] = await Promise.all([
          getTeacherBatches(),
          getTeacherModuleCatalog(),
        ]);
        if (ignore) {
          return;
        }
        setBatches(batchData);
        setModules(moduleData);
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load teacher analytics filters."
          );
        }
      } finally {
        if (!ignore) {
          setLoadingOptions(false);
        }
      }
    }

    void loadOptions();
    return () => {
      ignore = true;
    };
  }, []);

  const liveModules = useMemo(
    () => modules.filter((module) => !module.is_placeholder),
    [modules]
  );

  const allStudents = useMemo<StudentOption[]>(
    () =>
      batches
        .flatMap((batch) =>
          batch.students.map((student) => ({
            ...student,
            batch_id: batch.id,
            batch_name: batch.name,
          }))
        )
        .sort((left, right) => left.full_name.localeCompare(right.full_name)),
    [batches]
  );

  const availableStudents = useMemo(() => {
    const selectedBatchId = toOptionalNumber(filters.batchId);
    if (!selectedBatchId) {
      return allStudents;
    }
    return allStudents.filter((student) => student.batch_id === selectedBatchId);
  }, [allStudents, filters.batchId]);

  useEffect(() => {
    if (
      filters.studentId !== "all" &&
      !availableStudents.some((student) => student.user_id === Number(filters.studentId))
    ) {
      setFilters((current) => ({ ...current, studentId: "all" }));
    }
  }, [availableStudents, filters.studentId]);

  useEffect(() => {
    let ignore = false;

    async function loadAnalytics() {
      setLoadingAnalytics(true);
      setError(null);
      try {
        const overview = await getTeacherAnalyticsOverview({
          batch_id: toOptionalNumber(filters.batchId),
          module_id: toOptionalNumber(filters.moduleId),
          student_id: toOptionalNumber(filters.studentId),
          ...DASHBOARD_LIMITS,
        });
        if (!ignore) {
          setAnalytics(overview);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load teacher analytics."
          );
        }
      } finally {
        if (!ignore) {
          setLoadingAnalytics(false);
        }
      }
    }

    void loadAnalytics();
    return () => {
      ignore = true;
    };
  }, [filters.batchId, filters.moduleId, filters.studentId]);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === toOptionalNumber(filters.batchId)) ?? null,
    [batches, filters.batchId]
  );
  const selectedModule = useMemo(
    () => liveModules.find((module) => module.id === toOptionalNumber(filters.moduleId)) ?? null,
    [filters.moduleId, liveModules]
  );
  const selectedStudent = useMemo(
    () =>
      availableStudents.find((student) => student.user_id === toOptionalNumber(filters.studentId)) ??
      allStudents.find((student) => student.user_id === toOptionalNumber(filters.studentId)) ??
      null,
    [allStudents, availableStudents, filters.studentId]
  );

  const scopeLabel = useMemo(
    () =>
      buildScopeLabel({
        batchName: selectedBatch?.name,
        moduleTitle: selectedModule?.title,
        studentName: selectedStudent?.full_name,
      }),
    [selectedBatch, selectedModule, selectedStudent]
  );

  const summary = analytics?.summary;

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
          Teacher Analytics
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">
          Turn saved attempts, wrong answers, and snapshots into fast coaching decisions.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          Phase 5 replaces the static progress view with live analytics powered by the new
          assessment-attempt records. Filter by batch, module, or learner to isolate weak items,
          review evidence, and plan the next intervention block.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
            {scopeLabel}
          </span>
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Support threshold: {summary?.low_score_threshold ?? 75}% / Ready threshold:{" "}
            {summary?.ready_score_threshold ?? 90}%
          </span>
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Last activity: {formatDateTime(summary?.latest_attempted_at)}
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Filters
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Narrow the dashboard without leaving the page.
            </p>
          </div>
          {loadingOptions || loadingAnalytics ? (
            <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300">
              Refreshing analytics...
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-200">
            Batch
            <select
              className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  batchId: event.target.value,
                  studentId: "all",
                }))
              }
              value={filters.batchId}
            >
              <option value="all">All batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={String(batch.id)}>
                  {batch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-200">
            Module
            <select
              className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  moduleId: event.target.value,
                }))
              }
              value={filters.moduleId}
            >
              <option value="all">All modules</option>
              {liveModules.map((module) => (
                <option key={module.id} value={String(module.id)}>
                  {module.title}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-200">
            Student
            <select
              className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  studentId: event.target.value,
                }))
              }
              value={filters.studentId}
            >
              <option value="all">All students</option>
              {availableStudents.map((student) => (
                <option key={student.user_id} value={String(student.user_id)}>
                  {student.full_name} ({student.batch_name})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Need Intervention
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">
            {summary?.support_queue_count ?? 0}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Learners whose latest filtered attempt is below the support threshold.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            On Track
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">
            {summary?.on_track_count ?? 0}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Learners moving between support and ready lanes in the current filter scope.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Assessment Ready
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">
            {summary?.assessment_ready_count ?? 0}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Latest filtered attempts at or above the ready threshold.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Snapshot Evidence
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">
            {summary?.snapshot_evidence_count ?? 0}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Saved visual checkpoints available for teacher review.
          </p>
        </div>
      </div>

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-300">Error: {error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Cohort Pulse
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Average Score</p>
              <p className="mt-2 text-3xl font-black text-accentWarm">
                {formatPercent(summary?.average_score)}
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Based on each learner&apos;s latest attempt inside the current filter scope.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Learners Seen</p>
              <p className="mt-2 text-3xl font-black text-brandGreen">
                {summary?.filtered_students ?? 0}
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Unique students contributing attempt data to this view.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Attempts Saved</p>
              <p className="mt-2 text-3xl font-black text-accent">
                {summary?.filtered_attempts ?? 0}
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Total recorded attempts matching the active batch, module, and learner filters.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Next Action</p>
              <p className="mt-2 text-3xl font-black text-brandBlue">
                {summary?.support_queue_count ? "Coach" : "Monitor"}
              </p>
              <p className="mt-2 text-xs text-slate-300">
                Use the low-score queue and missed-item list below to decide the next reteach block.
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            Intervention Suggestions
          </p>
          <div className="mt-4 space-y-3">
            {analytics?.intervention_suggestions.length ? (
              analytics.intervention_suggestions.map((suggestion) => (
                <div
                  key={`${suggestion.priority}-${suggestion.title}`}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-black text-brandWhite">{suggestion.title}</p>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${priorityTone(
                        suggestion.priority
                      )}`}
                    >
                      {suggestion.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    {suggestion.rationale}
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                    Suggested action
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-200">
                    {suggestion.suggested_action}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState message="No suggestions yet. Save more student attempts to unlock coaching recommendations." />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.98fr,1.02fr]">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Low-Score Queue
            </p>
            <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300">
              Latest or average score below {summary?.low_score_threshold ?? 75}%
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {analytics?.low_scoring_students.length ? (
              analytics.low_scoring_students.map((student) => (
                <div
                  key={student.user_id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-brandWhite">{student.full_name}</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {student.username}
                        {student.batch_name ? ` / ${student.batch_name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreTone(
                        student.latest_score
                      )}`}
                    >
                      Latest {formatPercent(student.latest_score)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                        Average
                      </p>
                      <p className="mt-2 text-lg font-black text-brandWhite">
                        {formatPercent(student.average_score)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                        Attempts
                      </p>
                      <p className="mt-2 text-lg font-black text-brandWhite">
                        {student.attempt_count}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                        Last Saved
                      </p>
                      <p className="mt-2 text-sm font-semibold text-brandWhite">
                        {formatDateTime(student.latest_submitted_at)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-300">
                    Focus area: {student.latest_module_title} / {student.latest_assessment_title}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState message="No low-scoring learners in the current filter scope." />
            )}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Most-Missed Questions And Signs
          </p>
          <div className="mt-4 space-y-3">
            {analytics?.wrong_items.length ? (
              analytics.wrong_items.map((item) => (
                <div
                  key={`${item.module_id}-${item.assessment_id}-${item.assessment_item_id}`}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-brandWhite">{item.prompt}</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {item.module_title} / {item.assessment_title}
                      </p>
                    </div>
                    <span className="rounded-full border border-accent/30 bg-accent/20 px-3 py-1 text-xs font-semibold text-accentWarm">
                      Missed {item.miss_count}x
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                        Miss Rate
                      </p>
                      <p className="mt-2 text-lg font-black text-brandWhite">
                        {formatPercent(item.miss_rate_percent)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                        Learners
                      </p>
                      <p className="mt-2 text-lg font-black text-brandWhite">
                        {item.unique_student_count}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                        Seen In Attempts
                      </p>
                      <p className="mt-2 text-lg font-black text-brandWhite">
                        {item.appearance_count}
                      </p>
                    </div>
                  </div>

                  {item.expected_response ? (
                    <p className="mt-3 text-xs leading-relaxed text-slate-300">
                      Expected response: <span className="font-semibold text-slate-100">{item.expected_response}</span>
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState message="No missed prompts yet for the current filters." />
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
            Recent Attempt History
          </p>
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Most recent saved attempts in scope
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {analytics?.recent_attempts.length ? (
            analytics.recent_attempts.map((attempt) => (
              <div
                key={attempt.attempt_id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-brandWhite">{attempt.full_name}</p>
                    <p className="mt-1 text-xs text-slate-300">
                      {attempt.module_title} / {attempt.assessment_title}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      {attempt.batch_name ? `${attempt.batch_name} / ` : ""}
                      {formatDateTime(attempt.submitted_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreTone(
                      attempt.score_percent
                    )}`}
                  >
                    {formatPercent(attempt.score_percent)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Score</p>
                    <p className="mt-2 text-lg font-black text-brandWhite">
                      {formatScoreFraction(attempt.score_correct, attempt.score_total)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Wrong</p>
                    <p className="mt-2 text-lg font-black text-brandWhite">
                      {attempt.wrong_answer_count}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                      Snapshots
                    </p>
                    <p className="mt-2 text-lg font-black text-brandWhite">
                      {attempt.snapshot_count}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Type</p>
                    <p className="mt-2 text-sm font-semibold uppercase text-brandWhite">
                      {attempt.assessment_type.replaceAll("_", " ")}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState message="No recent attempts yet for the current filter scope." />
          )}
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            Snapshot-Backed Evidence
          </p>
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300">
            Incorrect evidence is shown first
          </span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {analytics?.snapshot_evidence.length ? (
            analytics.snapshot_evidence.map((snapshot) => (
              <div
                key={`${snapshot.attempt_id}-${snapshot.assessment_item_id}-${snapshot.image_path}`}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-brandWhite">
                      {snapshot.label ?? snapshot.prompt ?? "Saved snapshot"}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      {snapshot.full_name} / {snapshot.module_title}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      snapshot.is_correct === false
                        ? "border border-accent/30 bg-accent/20 text-accentWarm"
                        : snapshot.is_correct === true
                          ? "border border-brandGreen/30 bg-brandGreen/20 text-brandGreen"
                          : "border border-brandBlue/30 bg-brandBlue/20 text-brandBlue"
                    }`}
                  >
                    {snapshot.is_correct === false
                      ? "Needs review"
                      : snapshot.is_correct === true
                        ? "Correct"
                        : "Unscored"}
                  </span>
                </div>

                <a
                  className="mt-4 block overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                  href={`${getUploadBase()}/${snapshot.image_path}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <img
                    alt={snapshot.label ?? snapshot.prompt ?? "Assessment snapshot"}
                    className="h-52 w-full object-cover"
                    src={`${getUploadBase()}/${snapshot.image_path}`}
                  />
                </a>

                <div className="mt-4 space-y-2 text-xs leading-relaxed text-slate-300">
                  {snapshot.prompt ? <p>Prompt: {snapshot.prompt}</p> : null}
                  {snapshot.expected_response ? (
                    <p>Expected: {snapshot.expected_response}</p>
                  ) : null}
                  {snapshot.response_text ? <p>Response: {snapshot.response_text}</p> : null}
                  <p>Saved: {formatDateTime(snapshot.submitted_at)}</p>
                </div>
              </div>
            ))
          ) : (
            <EmptyState message="No snapshot evidence saved for the current filter scope." />
          )}
        </div>
      </div>
    </section>
  );
}
