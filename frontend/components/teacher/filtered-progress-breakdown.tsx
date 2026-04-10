"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { TeacherStudentReviewPanels } from "@/components/teacher/student-review-panels";
import {
  ModuleItem,
  TeacherActivityAttempt,
  TeacherBatch,
  TeacherBreakdownModuleMetric,
  TeacherReportBreakdownResponse,
  TeacherStudent,
  getModules,
  getTeacherBatches,
  getTeacherReportBreakdown,
  getTeacherStudent,
  getTeacherStudentActivityAttempts,
} from "@/lib/api";

const BREAKDOWN_PREVIEW_LIMIT = 10;

type BreakdownFilterControlsProps = {
  batches: TeacherBatch[];
  modules: ModuleItem[];
  selectedBatchId: string;
  selectedModuleId: string;
  showArchivedBatches: boolean;
  onBatchChange: (value: string) => void;
  onModuleChange: (value: string) => void;
  onShowArchivedChange: (checked: boolean) => void;
  onClear: () => void;
};

type BreakdownTableProps = {
  breakdown: TeacherReportBreakdownResponse;
  rowLimit?: number;
  showStudentActions?: boolean;
  onOpenStudentDetails?: (studentId: number, studentName: string) => void;
};

type BreakdownModalProps = {
  breakdown: TeacherReportBreakdownResponse | null;
  breakdownLabel: string;
  batches: TeacherBatch[];
  modules: ModuleItem[];
  selectedBatchId: string;
  selectedModuleId: string;
  showArchivedBatches: boolean;
  onBatchChange: (value: string) => void;
  onModuleChange: (value: string) => void;
  onShowArchivedChange: (checked: boolean) => void;
  onClearFilters: () => void;
  onOpenStudentDetails: (studentId: number, studentName: string) => void;
  onClose: () => void;
};

type StudentProgressModalProps = {
  studentName: string | null;
  student: TeacherStudent | null;
  attempts: TeacherActivityAttempt[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

function getBreakdownRowTypeLabel(mode: TeacherReportBreakdownResponse["mode"]) {
  return mode === "module" ? "batch row(s)" : "student row(s)";
}

function getBreakdownPreviewLabel(
  breakdown: TeacherReportBreakdownResponse,
  rowLimit = BREAKDOWN_PREVIEW_LIMIT
) {
  const totalRows = breakdown.rows.length;
  const rowTypeLabel = getBreakdownRowTypeLabel(breakdown.mode);

  return totalRows > rowLimit
    ? `Showing top ${rowLimit} of ${totalRows} ${rowTypeLabel}`
    : `Showing ${totalRows} ${rowTypeLabel}`;
}

function getBreakdownTotalLabel(breakdown: TeacherReportBreakdownResponse) {
  return `${breakdown.rows.length} ${getBreakdownRowTypeLabel(breakdown.mode)}`;
}

function getBreakdownEmptyMessage(mode: TeacherReportBreakdownResponse["mode"]) {
  switch (mode) {
    case "all":
      return "No active students are available for the current table view yet.";
    case "batch":
      return "No saved activity attempts matched the selected batch yet.";
    case "module":
      return "No saved activity attempts matched the selected live module yet.";
    case "batch_module":
      return "No saved activity attempts matched the selected batch and module yet.";
  }
}

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

function formatModuleMetric(metric: TeacherBreakdownModuleMetric | null | undefined) {
  if (!metric) {
    return "No module data";
  }
  return `${metric.module_title} (${metric.count})`;
}

function getStudentAttemptSummary(attempts: TeacherActivityAttempt[]) {
  if (!attempts.length) {
    return { average: 0, latestAt: null as string | null };
  }

  return {
    average: attempts.reduce((total, attempt) => total + attempt.score_percent, 0) / attempts.length,
    latestAt: attempts[0]?.submitted_at ?? null,
  };
}

function BreakdownFilterControls({
  batches,
  modules,
  selectedBatchId,
  selectedModuleId,
  showArchivedBatches,
  onBatchChange,
  onModuleChange,
  onShowArchivedChange,
  onClear,
}: BreakdownFilterControlsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr,1fr,auto,auto]">
      <label className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandBlue">
          Enrolled Batch
        </span>
        <select
          className="teacher-card-control"
          onChange={(event) => onBatchChange(event.target.value)}
          value={selectedBatchId}
        >
          <option value="">
            {showArchivedBatches ? "All visible batches" : "All active batches"}
          </option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
              {batch.status === "archived" ? " (Archived)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandGreen">
          Live Module
        </span>
        <select
          className="teacher-card-control"
          onChange={(event) => onModuleChange(event.target.value)}
          value={selectedModuleId}
        >
          <option value="">All live modules</option>
          {modules.map((module) => (
            <option key={module.id} value={module.id}>
              Module {module.order_index}: {module.title}
            </option>
          ))}
        </select>
      </label>

      <label className="teacher-card-copy flex items-center gap-2 text-sm font-semibold xl:self-end xl:pb-2">
        <input
          checked={showArchivedBatches}
          onChange={(event) => onShowArchivedChange(event.target.checked)}
          type="checkbox"
        />
        Show Archived Batches
      </label>

      <button
        className="teacher-card-ghost-button rounded-xl border px-3 py-2 text-sm font-semibold transition xl:self-end"
        onClick={onClear}
        type="button"
      >
        Clear Filters
      </button>
    </div>
  );
}

function BreakdownTable({
  breakdown,
  rowLimit,
  showStudentActions = false,
  onOpenStudentDetails,
}: BreakdownTableProps) {
  const canOpenStudentDetails = showStudentActions && Boolean(onOpenStudentDetails);

  switch (breakdown.mode) {
    case "all": {
      const rows = rowLimit === undefined ? breakdown.rows : breakdown.rows.slice(0, rowLimit);

      return (
        <table className="min-w-full text-sm">
          <thead className="bg-black/10">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Student Name
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-accentWarm">
                Enrolled Batch
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                Average Score
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                Attempts
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Latest Attempt
              </th>
              {canOpenStudentDetails ? (
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                  More Details
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {rows.map((row) => (
              <tr key={row.student_id}>
                <td className="px-4 py-3">
                  <p className="teacher-card-title font-semibold">{row.student_name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="teacher-card-copy">{row.batch_name}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-title font-semibold">
                    {formatPercent(row.average_score_percent, 2)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.attempt_count}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="teacher-card-copy">{formatDateTime(row.latest_attempt_at)}</p>
                </td>
                {canOpenStudentDetails ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      className="inline-flex rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
                      onClick={() => onOpenStudentDetails?.(row.student_id, row.student_name)}
                      type="button"
                    >
                      More Details
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case "batch": {
      const rows = rowLimit === undefined ? breakdown.rows : breakdown.rows.slice(0, rowLimit);

      return (
        <table className="min-w-full text-sm">
          <thead className="bg-black/10">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Student Name
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                Average Score
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                Attempts
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-accentWarm">
                Highest Correct Module
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Highest Incorrect Module
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                Latest Attempt
              </th>
              {canOpenStudentDetails ? (
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                  More Details
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {rows.map((row) => (
              <tr key={row.student_id}>
                <td className="px-4 py-3">
                  <p className="teacher-card-title font-semibold">{row.student_name}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-title font-semibold">
                    {formatPercent(row.average_score_percent, 2)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.attempt_count}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="teacher-card-copy">
                    {formatModuleMetric(row.highest_correct_module)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="teacher-card-copy">
                    {formatModuleMetric(row.highest_incorrect_module)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="teacher-card-copy">{formatDateTime(row.latest_attempt_at)}</p>
                </td>
                {canOpenStudentDetails ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      className="inline-flex rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
                      onClick={() => onOpenStudentDetails?.(row.student_id, row.student_name)}
                      type="button"
                    >
                      More Details
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case "module": {
      const rows = rowLimit === undefined ? breakdown.rows : breakdown.rows.slice(0, rowLimit);

      return (
        <table className="min-w-full text-sm">
          <thead className="bg-black/10">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Registered Batch
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                Average Score
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                Attempts
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accentWarm">
                Correct Answers
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Incorrect Answers
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {rows.map((row) => (
              <tr key={`${row.batch_id ?? "unassigned"}-${row.batch_name}`}>
                <td className="px-4 py-3">
                  <p className="teacher-card-title font-semibold">{row.batch_name}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-title font-semibold">
                    {formatPercent(row.average_score_percent, 2)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.attempt_count}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.correct_answers}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.incorrect_answers}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case "batch_module": {
      const rows = rowLimit === undefined ? breakdown.rows : breakdown.rows.slice(0, rowLimit);

      return (
        <table className="min-w-full text-sm">
          <thead className="bg-black/10">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Student Name
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                Average Score
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                Attempts
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accentWarm">
                Correct Answers
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                Incorrect Answers
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                Latest Attempt
              </th>
              {canOpenStudentDetails ? (
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                  More Details
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {rows.map((row) => (
              <tr key={row.student_id}>
                <td className="px-4 py-3">
                  <p className="teacher-card-title font-semibold">{row.student_name}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-title font-semibold">
                    {formatPercent(row.average_score_percent, 2)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.attempt_count}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.correct_answers}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="teacher-card-copy">{row.incorrect_answers}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="teacher-card-copy">{formatDateTime(row.latest_attempt_at)}</p>
                </td>
                {canOpenStudentDetails ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      className="inline-flex rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
                      onClick={() => onOpenStudentDetails?.(row.student_id, row.student_name)}
                      type="button"
                    >
                      More Details
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }
}

function BreakdownModal({
  breakdown,
  breakdownLabel,
  batches,
  modules,
  selectedBatchId,
  selectedModuleId,
  showArchivedBatches,
  onBatchChange,
  onModuleChange,
  onShowArchivedChange,
  onClearFilters,
  onOpenStudentDetails,
  onClose,
}: BreakdownModalProps) {
  if (!breakdown || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[230] overflow-y-auto bg-slate-950/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="relative flex min-h-full items-center justify-center p-3 md:p-6">
        <aside
          aria-label="Filtered Progress Breakdown"
          aria-modal="true"
          className="relative w-full max-w-[1180px]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[32px] border border-black/10 bg-[#f7f4ef] shadow-2xl md:max-h-[calc(100dvh-3rem)]">
            <div className="border-b border-black/10 bg-[#f7f4ef] px-5 py-5 md:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                    Detail View
                  </p>
                  <h3 className="teacher-panel-heading mt-1 text-2xl font-black leading-tight">
                    Filtered Progress Breakdown
                  </h3>
                  <p className="teacher-card-meta mt-2 text-sm">{breakdownLabel}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                    {getBreakdownTotalLabel(breakdown)}
                  </span>
                  <button
                    className="teacher-card-ghost-button rounded-xl border px-3 py-2 text-sm font-semibold transition"
                    onClick={onClose}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="border-b border-black/10 px-5 py-5 md:px-6">
              <BreakdownFilterControls
                batches={batches}
                modules={modules}
                selectedBatchId={selectedBatchId}
                selectedModuleId={selectedModuleId}
                showArchivedBatches={showArchivedBatches}
                onBatchChange={onBatchChange}
                onModuleChange={onModuleChange}
                onShowArchivedChange={onShowArchivedChange}
                onClear={onClearFilters}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
              {breakdown.rows.length ? (
                <div className="overflow-hidden rounded-[28px] border border-black/10 bg-black/5">
                  <div className="overflow-x-auto">
                    <BreakdownTable
                      breakdown={breakdown}
                      onOpenStudentDetails={onOpenStudentDetails}
                      showStudentActions={breakdown.mode !== "module"}
                    />
                  </div>
                </div>
              ) : (
                <div className="teacher-card-copy rounded-2xl border border-dashed border-black/10 bg-black/5 px-4 py-5 text-sm">
                  {getBreakdownEmptyMessage(breakdown.mode)}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body
  );
}

function StudentProgressModal({
  studentName,
  student,
  attempts,
  loading,
  error,
  onClose,
}: StudentProgressModalProps) {
  if (!studentName && !student && !loading && !error) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const attemptSummary = getStudentAttemptSummary(attempts);
  const title = student?.full_name ?? studentName ?? "Student progress";

  return createPortal(
    <div
      className="fixed inset-0 z-[240] overflow-y-auto bg-slate-950/55 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div className="relative flex min-h-full items-center justify-center p-3 md:p-6">
        <aside
          aria-label={title}
          aria-modal="true"
          className="relative w-full max-w-[1180px]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[32px] border border-black/10 bg-[#f7f4ef] shadow-2xl md:max-h-[calc(100dvh-3rem)]">
            <div className="border-b border-black/10 bg-[#f7f4ef] px-5 py-5 md:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
                    Student Progress
                  </p>
                  <h3 className="teacher-panel-heading mt-1 text-2xl font-black leading-tight">
                    {title}
                  </h3>
                  <p className="teacher-card-meta mt-2 text-sm">
                    Review module progress and saved activity attempts for this student.
                  </p>
                </div>

                <button
                  className="teacher-card-ghost-button rounded-xl border px-3 py-2 text-sm font-semibold transition"
                  onClick={onClose}
                  type="button"
                >
                  Close
                </button>
              </div>

              {student?.id ? (
                <div className="mt-3">
                  <Link
                    className="inline-flex rounded-full border border-brandBlue/25 bg-brandBlueLight px-4 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight/80"
                    href={`/teacher/students/${student.id}`}
                  >
                    Open Full Student Detail For Certificate Review
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
              {loading ? (
                <div className="rounded-[28px] border border-black/10 bg-black/5 px-5 py-5">
                  <p className="teacher-card-copy text-sm">Loading student progress...</p>
                </div>
              ) : error ? (
                <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-700">
                  Error: {error}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[28px] border border-black/10 bg-black/5 px-5 py-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
                        Batch
                      </p>
                      <p className="teacher-panel-value mt-3 text-2xl font-black">
                        {student?.batch?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="rounded-[28px] border border-black/10 bg-black/5 px-5 py-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
                        Attempts
                      </p>
                      <p className="teacher-panel-value mt-3 text-4xl font-black">
                        {attempts.length}
                      </p>
                    </div>
                    <div className="rounded-[28px] border border-black/10 bg-black/5 px-5 py-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
                        Average
                      </p>
                      <p className="teacher-panel-value mt-3 text-4xl font-black">
                        {formatPercent(attemptSummary.average, 2)}
                      </p>
                    </div>
                    <div className="rounded-[28px] border border-black/10 bg-black/5 px-5 py-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                        Latest
                      </p>
                      <p className="teacher-panel-value mt-3 text-sm font-black">
                        {formatDateTime(attemptSummary.latestAt)}
                      </p>
                    </div>
                  </div>

                  <TeacherStudentReviewPanels
                    activityPanelClassName="rounded-[28px] border border-black/10 bg-black/5 px-5 py-5"
                    activityTitle="Activity Taken"
                    attempts={attempts}
                    containerClassName="mt-4 grid gap-4 xl:grid-cols-[0.88fr,1.12fr]"
                    modulePanelClassName="rounded-[28px] border border-black/10 bg-black/5 px-5 py-5"
                    student={student}
                  />
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body
  );
}

export function TeacherFilteredProgressBreakdown() {
  const [batches, setBatches] = useState<TeacherBatch[]>([]);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [breakdown, setBreakdown] = useState<TeacherReportBreakdownResponse | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [showArchivedBatches, setShowArchivedBatches] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<TeacherStudent | null>(null);
  const [studentAttempts, setStudentAttempts] = useState<TeacherActivityAttempt[]>([]);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [studentDetailError, setStudentDetailError] = useState<string | null>(null);

  const batchId = selectedBatchId ? Number(selectedBatchId) : null;
  const moduleId = selectedModuleId ? Number(selectedModuleId) : null;
  const hasBatchFilter = batchId !== null;
  const hasModuleFilter = moduleId !== null;

  const selectedBatchName =
    batches.find((batch) => batch.id === batchId)?.name ??
    ((breakdown?.mode === "batch" || breakdown?.mode === "batch_module")
      ? breakdown.batch_name
      : null);
  const selectedModuleName =
    modules.find((module) => module.id === moduleId)?.title ??
    ((breakdown?.mode === "module" || breakdown?.mode === "batch_module")
      ? breakdown.module_title
      : null);

  const clearFilters = () => {
    setSelectedBatchId("");
    setSelectedModuleId("");
  };

  const closeStudentProgressModal = () => {
    setSelectedStudentId(null);
    setSelectedStudentName(null);
    setStudentDetail(null);
    setStudentAttempts([]);
    setStudentDetailError(null);
    setStudentDetailLoading(false);
  };

  const closeBreakdownModal = () => {
    setIsBreakdownModalOpen(false);
    closeStudentProgressModal();
  };

  const openBreakdownModal = () => {
    if (breakdown?.rows.length) {
      setIsBreakdownModalOpen(true);
    }
  };

  const openStudentProgressModal = (studentId: number, studentName: string) => {
    setSelectedStudentId(studentId);
    setSelectedStudentName(studentName);
  };

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setPageError(null);
        const [nextBatches, nextModules] = await Promise.all([
          getTeacherBatches({ status: showArchivedBatches ? "all" : "active" }),
          getModules(),
        ]);
        if (!isActive) {
          return;
        }
        setBatches(nextBatches);
        setModules(nextModules);
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setPageError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load progress breakdown filters."
        );
      }
    })();

    return () => {
      isActive = false;
    };
  }, [showArchivedBatches]);

  useEffect(() => {
    if (showArchivedBatches || !selectedBatchId) {
      return;
    }

    const selectedBatch = batches.find((batch) => String(batch.id) === selectedBatchId);
    if (selectedBatch?.status === "archived") {
      setSelectedBatchId("");
    }
  }, [batches, selectedBatchId, showArchivedBatches]);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setLoading(true);
        setPageError(null);
        const nextBreakdown = await getTeacherReportBreakdown({
          batchId,
          moduleId,
          includeArchivedBatches: showArchivedBatches,
        });
        if (!isActive) {
          return;
        }
        setBreakdown(nextBreakdown);
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setBreakdown(null);
        setPageError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load breakdown table."
        );
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [batchId, moduleId, showArchivedBatches]);

  useEffect(() => {
    if (selectedStudentId === null) {
      return;
    }

    let isActive = true;

    void (async () => {
      try {
        setStudentDetailLoading(true);
        setStudentDetailError(null);
        setStudentDetail(null);
        setStudentAttempts([]);

        const [nextStudent, nextAttempts] = await Promise.all([
          getTeacherStudent(selectedStudentId),
          getTeacherStudentActivityAttempts(selectedStudentId),
        ]);

        if (!isActive) {
          return;
        }

        setStudentDetail(nextStudent);
        setStudentAttempts(nextAttempts);
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setStudentDetailError(
          requestError instanceof Error ? requestError.message : "Unable to load student progress."
        );
      } finally {
        if (isActive) {
          setStudentDetailLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [selectedStudentId]);

  useEffect(() => {
    if (!isBreakdownModalOpen && selectedStudentId === null) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (selectedStudentId !== null) {
        closeStudentProgressModal();
        return;
      }

      if (isBreakdownModalOpen) {
        closeBreakdownModal();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBreakdownModalOpen, selectedStudentId]);

  const breakdownLabel =
    !hasBatchFilter && !hasModuleFilter
      ? `Enrolled Batch: ${showArchivedBatches ? "All visible batches" : "All active batches"} | Live Module: All live modules`
      : hasBatchFilter && hasModuleFilter
        ? `Enrolled Batch: ${selectedBatchName ?? "Selected batch"} | Live Module: ${selectedModuleName ?? "Selected module"}`
        : hasBatchFilter
          ? `Enrolled Batch: ${selectedBatchName ?? "Selected batch"}`
          : `Live Module: ${selectedModuleName ?? "Selected module"}`;
  const hasBreakdownRows = Boolean(breakdown?.rows.length);
  const breakdownPreviewLabel = breakdown ? getBreakdownPreviewLabel(breakdown) : null;

  return (
    <>
      <div className="panel space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Filtered Progress Breakdown
            </p>
            <h3 className="teacher-panel-heading mt-2 text-2xl font-black">
              Review progress by batch, module, or both
            </h3>
            <p className="teacher-panel-copy mt-2 text-sm">
              Use these filters inside class management when you want a roster-aware view of saved
              activity results before opening a batch or student in detail.
            </p>
          </div>
          {breakdown ? (
            <span className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
              {breakdownPreviewLabel ?? "No rows"}
            </span>
          ) : null}
        </div>

        <BreakdownFilterControls
          batches={batches}
          modules={modules}
          selectedBatchId={selectedBatchId}
          selectedModuleId={selectedModuleId}
          showArchivedBatches={showArchivedBatches}
          onBatchChange={setSelectedBatchId}
          onModuleChange={setSelectedModuleId}
          onShowArchivedChange={setShowArchivedBatches}
          onClear={clearFilters}
        />

        <div className="rounded-3xl border border-black/10 bg-black/5 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                Filtered Progress Breakdown
              </p>
              <p className="teacher-card-meta mt-2 text-xs">{breakdownLabel}</p>
            </div>
            {breakdown ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="teacher-card-meta text-xs">{breakdownPreviewLabel}</p>
                {hasBreakdownRows ? (
                  <button
                    className="teacher-card-ghost-button rounded-xl border px-3 py-2 text-sm font-semibold transition"
                    onClick={openBreakdownModal}
                    type="button"
                  >
                    View Full Table
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="teacher-card-copy mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm">
              Loading filtered breakdown...
            </div>
          ) : pageError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
              Error: {pageError}
            </div>
          ) : breakdown ? (
            breakdown.rows.length ? (
              <div
                aria-disabled={!hasBreakdownRows}
                aria-haspopup={hasBreakdownRows ? "dialog" : undefined}
                className={`mt-4 rounded-[24px] ${
                  hasBreakdownRows
                    ? "group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brandBlue/50"
                    : ""
                }`}
                onClick={openBreakdownModal}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openBreakdownModal();
                  }
                }}
                role={hasBreakdownRows ? "button" : undefined}
                tabIndex={hasBreakdownRows ? 0 : undefined}
              >
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10 transition group-hover:border-black/20 group-hover:bg-black/15">
                  <div className="overflow-x-auto">
                    <BreakdownTable breakdown={breakdown} rowLimit={BREAKDOWN_PREVIEW_LIMIT} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
                  <p className="teacher-card-meta text-xs">
                    Click the preview table to open the full breakdown view.
                  </p>
                  <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 transition group-hover:bg-black/10">
                    Full View
                  </span>
                </div>
              </div>
            ) : (
              <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                {getBreakdownEmptyMessage(breakdown.mode)}
              </div>
            )
          ) : (
            <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
              No breakdown data is available for the current filters.
            </div>
          )}
        </div>
      </div>

      <BreakdownModal
        batches={batches}
        breakdown={isBreakdownModalOpen ? breakdown : null}
        breakdownLabel={breakdownLabel}
        modules={modules}
        onBatchChange={setSelectedBatchId}
        onClearFilters={clearFilters}
        onClose={closeBreakdownModal}
        onModuleChange={setSelectedModuleId}
        onOpenStudentDetails={openStudentProgressModal}
        onShowArchivedChange={setShowArchivedBatches}
        selectedBatchId={selectedBatchId}
        selectedModuleId={selectedModuleId}
        showArchivedBatches={showArchivedBatches}
      />

      <StudentProgressModal
        attempts={studentAttempts}
        error={selectedStudentId !== null ? studentDetailError : null}
        loading={selectedStudentId !== null ? studentDetailLoading : false}
        onClose={closeStudentProgressModal}
        student={studentDetail}
        studentName={selectedStudentId !== null ? selectedStudentName : null}
      />
    </>
  );
}
