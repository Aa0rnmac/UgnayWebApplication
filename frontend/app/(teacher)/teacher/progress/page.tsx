"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  ModuleItem,
  TeacherAttentionStudent,
  TeacherBatch,
  TeacherBreakdownModuleMetric,
  TeacherReportBreakdownResponse,
  TeacherReportSummary,
  TeacherWeakItem,
  getModules,
  getTeacherBatches,
  getTeacherReportBreakdown,
  getTeacherReportSummary,
} from "@/lib/api";

const PREVIEW_LIMIT = 5;

type DetailPanel = "weak_items" | "students";

type AlertSummaryCardProps = {
  title: string;
  badge: string;
  accentClassName: string;
  summaryStats: Array<{ label: string; value: string }>;
  preview: ReactNode;
  emptyMessage: string;
  footerLabel: string;
  onOpen: () => void;
  disabled?: boolean;
};

type DetailDrawerProps = {
  activePanel: DetailPanel | null;
  onClose: () => void;
  weakItems: TeacherWeakItem[];
  attentionStudents: TeacherAttentionStudent[];
};

function getPreviewBadgeLabel(itemsLength: number) {
  if (itemsLength === 0) {
    return "No items";
  }
  return itemsLength > PREVIEW_LIMIT ? `Top ${PREVIEW_LIMIT}` : `Showing ${itemsLength}`;
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

function getMostAffectedWeakModule(weakItems: TeacherWeakItem[]) {
  if (weakItems.length === 0) {
    return "No module data";
  }

  const moduleMap = new Map<string, { hits: number; worstRate: number }>();
  for (const item of weakItems) {
    const current = moduleMap.get(item.module_title) ?? { hits: 0, worstRate: 0 };
    current.hits += 1;
    current.worstRate = Math.max(current.worstRate, item.wrong_rate_percent);
    moduleMap.set(item.module_title, current);
  }

  const [moduleTitle] = [...moduleMap.entries()].sort((left, right) => {
    if (right[1].hits !== left[1].hits) {
      return right[1].hits - left[1].hits;
    }
    if (right[1].worstRate !== left[1].worstRate) {
      return right[1].worstRate - left[1].worstRate;
    }
    return left[0].localeCompare(right[0]);
  })[0];

  return moduleTitle;
}

function getLowestStudentAverage(attentionStudents: TeacherAttentionStudent[]) {
  if (attentionStudents.length === 0) {
    return "No data";
  }
  return formatPercent(
    attentionStudents.reduce(
      (lowest, student) => Math.min(lowest, student.average_score_percent),
      attentionStudents[0].average_score_percent
    ),
    2
  );
}

function getLatestFlaggedAttempt(attentionStudents: TeacherAttentionStudent[]) {
  if (attentionStudents.length === 0) {
    return "No activity yet";
  }

  const latest = attentionStudents.reduce((latestValue, student) => {
    if (!latestValue) {
      return student.latest_attempt_at;
    }
    return new Date(student.latest_attempt_at) > new Date(latestValue)
      ? student.latest_attempt_at
      : latestValue;
  }, attentionStudents[0].latest_attempt_at);

  return formatDateTime(latest);
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-black/5 px-3 py-3">
      <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.22em]">{label}</p>
      <p className="teacher-card-title mt-2 text-base font-black">{value}</p>
    </div>
  );
}

function AlertSummaryCard({
  title,
  badge,
  accentClassName,
  summaryStats,
  preview,
  emptyMessage,
  footerLabel,
  onOpen,
  disabled = false,
}: AlertSummaryCardProps) {
  return (
    <button
      aria-disabled={disabled}
      aria-haspopup="dialog"
      className="panel group relative flex h-full min-h-[430px] flex-col overflow-hidden text-left transition hover:-translate-y-1 disabled:cursor-default disabled:hover:translate-y-0"
      disabled={disabled}
      onClick={onOpen}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${accentClassName}`}>
          {title}
        </p>
        <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
          {badge}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {summaryStats.map((stat) => (
          <SummaryStat key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <div className="relative mt-4 flex-1">
        {disabled ? (
          <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
            {emptyMessage}
          </div>
        ) : (
          <>
            <div className="space-y-3 overflow-hidden">{preview}</div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/95 to-white/0" />
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/5 pt-4">
        <p className="teacher-card-meta text-xs">Click card to open full details.</p>
        <span className="inline-flex rounded-full border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold text-slate-800 transition group-hover:bg-black/10">
          {footerLabel}
        </span>
      </div>
    </button>
  );
}

function DetailDrawer({
  activePanel,
  onClose,
  weakItems,
  attentionStudents,
}: DetailDrawerProps) {
  if (!activePanel) {
    return null;
  }

  let title = "";
  let subtitle = "";
  let content: ReactNode = null;

  if (activePanel === "weak_items") {
    title = "Modules That Need Attention";
    subtitle = `${weakItems.length} weak item(s) across all active batches and all modules.`;
    content = weakItems.length ? (
      <div className="space-y-4">
        {weakItems.map((item) => (
          <article
            key={`${item.activity_key}-${item.item_key}`}
            className="rounded-[24px] border border-black/10 bg-black/20 px-4 py-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="teacher-card-title text-base font-black leading-tight">
                  {item.activity_title}
                </p>
                <p className="teacher-card-meta mt-2 text-sm">
                  {item.module_title} - {item.attempt_count} attempts
                </p>
              </div>
              <div className="shrink-0 rounded-2xl border border-black/10 bg-white/75 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm">
                {formatPercent(item.wrong_rate_percent, 2)} wrong rate
              </div>
            </div>
            <p className="teacher-card-copy mt-4 text-base">
              {item.prompt ?? item.expected_answer ?? item.item_key}
            </p>
            <p className="teacher-card-meta mt-3 text-sm">
              Wrong {item.wrong_count} time(s) across {item.attempt_count} attempts
            </p>
          </article>
        ))}
      </div>
    ) : (
      <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
        No weak items were flagged across active batches and modules yet.
      </div>
    );
  }

  if (activePanel === "students") {
    title = "Students Needing Attention";
    subtitle = `${attentionStudents.length} flagged student(s) across all active batches and all modules.`;
    content = attentionStudents.length ? (
      <div className="space-y-4">
        {attentionStudents.map((student) => (
          <article
            key={student.student_id}
            className="rounded-[24px] border border-black/10 bg-black/20 px-4 py-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="teacher-card-title text-base font-black leading-tight">
                  {student.student_name}
                </p>
                <p className="teacher-card-meta mt-2 text-sm">
                  {student.batch_name ?? "Unassigned batch"} - {student.attempt_count} attempts
                </p>
              </div>
              <Link
                className="inline-flex shrink-0 rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
                href={`/teacher/students/${student.student_id}`}
                onClick={onClose}
              >
                Open Student
              </Link>
            </div>
            <p className="teacher-card-copy mt-4 text-base">
              Average {formatPercent(student.average_score_percent, 2)} - {student.low_score_count} low score(s) in the latest five attempts
            </p>
            <p className="teacher-card-meta mt-3 text-sm">
              Latest attempt {formatDateTime(student.latest_attempt_at)}
            </p>
          </article>
        ))}
      </div>
    ) : (
      <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
        No students are currently flagged across active batches and modules.
      </div>
    );
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[220] overflow-y-auto bg-slate-950/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="relative flex min-h-full items-start justify-end p-3 md:p-6">
        <aside
          aria-label={title}
          aria-modal="true"
          className="relative w-full max-w-[560px]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[30px] border border-black/10 bg-[#f7f4ef] shadow-2xl md:max-h-[calc(100dvh-3rem)]">
            <div className="border-b border-black/10 bg-[#f7f4ef] px-5 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
                  Detail View
                </p>
                <h3 className="teacher-panel-heading mt-1 text-2xl font-black leading-tight">{title}</h3>
                <p className="teacher-card-meta mt-2 text-sm">{subtitle}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">{content}</div>
          </div>
        </aside>
      </div>
    </div>,
    document.body
  );
}

export default function TeacherProgressPage() {
  const [overviewSummary, setOverviewSummary] = useState<TeacherReportSummary | null>(null);
  const [batches, setBatches] = useState<TeacherBatch[]>([]);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [breakdown, setBreakdown] = useState<TeacherReportBreakdownResponse | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [showArchivedBatches, setShowArchivedBatches] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [staticError, setStaticError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<DetailPanel | null>(null);

  const batchId = selectedBatchId ? Number(selectedBatchId) : null;
  const moduleId = selectedModuleId ? Number(selectedModuleId) : null;
  const hasBatchFilter = batchId !== null;
  const hasModuleFilter = moduleId !== null;

  const selectedBatchName =
    batches.find((batch) => batch.id === batchId)?.name ??
    (breakdown?.mode === "batch" ? breakdown.batch_name : null);
  const selectedModuleName =
    modules.find((module) => module.id === moduleId)?.title ??
    (breakdown?.mode === "module" ? breakdown.module_title : null);

  const weakItems = overviewSummary?.weak_items ?? [];
  const attentionStudents = overviewSummary?.students_needing_attention ?? [];
  const registeredStudentCount = overviewSummary?.registered_student_count ?? 0;

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setStaticError(null);
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
        setStaticError(
          requestError instanceof Error ? requestError.message : "Unable to load teacher reports."
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
        setSummaryLoading(true);
        setSummaryError(null);
        const nextSummary = await getTeacherReportSummary();
        if (!isActive) {
          return;
        }
        setOverviewSummary(nextSummary);
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setSummaryError(
          requestError instanceof Error ? requestError.message : "Unable to load teacher summary."
        );
      } finally {
        if (isActive) {
          setSummaryLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setBreakdownLoading(true);
        setBreakdownError(null);
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
        setBreakdownError(
          requestError instanceof Error ? requestError.message : "Unable to load breakdown table."
        );
      } finally {
        if (isActive) {
          setBreakdownLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [batchId, moduleId, showArchivedBatches]);

  useEffect(() => {
    if (!activePanel) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePanel(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePanel]);

  const globalError = staticError ?? summaryError;
  const breakdownLabel =
    !hasBatchFilter && !hasModuleFilter
      ? `Enrolled Batch: ${showArchivedBatches ? "All visible batches" : "All active batches"} | Live Module: All live modules`
      : hasBatchFilter && hasModuleFilter
        ? `Enrolled Batch: ${selectedBatchName ?? "Selected batch"} | Live Module: ${selectedModuleName ?? "Selected module"}`
        : hasBatchFilter
          ? `Enrolled Batch: ${selectedBatchName ?? "Selected batch"}`
          : `Live Module: ${selectedModuleName ?? "Selected module"}`;

  return (
    <>
      <section className="space-y-6">
        <div className="panel overflow-hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
            Teacher Progress
          </p>
          <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
            Spot weak items and attention students from saved activity data.
          </h2>
          <p className="teacher-panel-copy mt-3 max-w-3xl text-sm leading-relaxed">
            The alert cards below reflect all active batches and all modules, while the filters only
            control the breakdown table.
          </p>

          <div className="mt-5 rounded-3xl border border-black/10 bg-black/5 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              Students Count
            </p>
            <p className="teacher-panel-value mt-3 text-4xl font-black">
              {overviewSummary ? registeredStudentCount : "..."}
            </p>
            <p className="teacher-panel-copy mt-2 text-sm">
              Approved active students. Includes learners with 0 progress and 0 attempts.
            </p>
          </div>

          {summaryLoading ? (
            <div className="teacher-card-copy mt-4 rounded-2xl border border-black/10 bg-black/5 px-4 py-4 text-sm">
              Refreshing teacher summary...
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <AlertSummaryCard
              accentClassName="text-accentWarm"
              badge={getPreviewBadgeLabel(weakItems.length)}
              disabled={weakItems.length === 0}
              emptyMessage="No weak items were flagged across active batches and modules yet. Weak items appear after at least 5 attempts and a 40% wrong rate."
              footerLabel="View all weak items"
              onOpen={() => setActivePanel("weak_items")}
              preview={weakItems.slice(0, PREVIEW_LIMIT).map((item) => (
                <div
                  key={`${item.activity_key}-${item.item_key}`}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="teacher-card-title truncate text-sm font-black">
                        {item.activity_title}
                      </p>
                      <p className="teacher-card-meta mt-1 truncate text-xs">
                        {item.module_title}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                      {formatPercent(item.wrong_rate_percent, 2)}
                    </div>
                  </div>
                  <p className="teacher-card-copy mt-2 line-clamp-2 text-sm">
                    {item.prompt ?? item.expected_answer ?? item.item_key}
                  </p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Wrong {item.wrong_count} time(s) - {item.attempt_count} attempts
                  </p>
                </div>
              ))}
              summaryStats={[
                { label: "Weak Items", value: `${weakItems.length}` },
                {
                  label: "Worst Wrong Rate",
                  value: weakItems[0]
                    ? formatPercent(weakItems[0].wrong_rate_percent, 2)
                    : "No data",
                },
                {
                  label: "Most Affected Module",
                  value: getMostAffectedWeakModule(weakItems),
                },
              ]}
              title="MODULES THAT NEED ATTENTION"
            />

            <AlertSummaryCard
              accentClassName="text-brandGreen"
              badge={getPreviewBadgeLabel(attentionStudents.length)}
              disabled={attentionStudents.length === 0}
              emptyMessage="No students are currently flagged across active batches and modules."
              footerLabel="View all students"
              onOpen={() => setActivePanel("students")}
              preview={attentionStudents.slice(0, PREVIEW_LIMIT).map((student) => (
                <div
                  key={student.student_id}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="teacher-card-title truncate text-sm font-black">
                        {student.student_name}
                      </p>
                      <p className="teacher-card-meta mt-1 truncate text-xs">
                        {student.batch_name ?? "Unassigned batch"}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                      {formatPercent(student.average_score_percent, 2)}
                    </div>
                  </div>
                  <p className="teacher-card-copy mt-2 text-sm">
                    {student.low_score_count} low score(s) in latest five attempts
                  </p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    {student.attempt_count} attempts - {formatDateTime(student.latest_attempt_at)}
                  </p>
                </div>
              ))}
              summaryStats={[
                { label: "Flagged Students", value: `${attentionStudents.length}` },
                {
                  label: "Lowest Average",
                  value: getLowestStudentAverage(attentionStudents),
                },
                {
                  label: "Latest Flagged",
                  value: getLatestFlaggedAttempt(attentionStudents),
                },
              ]}
              title="STUDENTS NEEDING ATTENTION"
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr,1fr,auto,auto]">
            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandBlue">
                Enrolled Batch
              </span>
              <select
                className="teacher-card-control"
                onChange={(event) => setSelectedBatchId(event.target.value)}
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
                onChange={(event) => setSelectedModuleId(event.target.value)}
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
                onChange={(event) => setShowArchivedBatches(event.target.checked)}
                type="checkbox"
              />
              Show Archived Batches
            </label>
            <button
              className="teacher-card-ghost-button rounded-xl border px-3 py-2 text-sm font-semibold transition xl:self-end"
              onClick={() => {
                setSelectedBatchId("");
                setSelectedModuleId("");
              }}
              type="button"
            >
              Clear Filters
            </button>
          </div>

          <div className="mt-5 rounded-3xl border border-black/10 bg-black/5 px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                  Filtered Progress Breakdown
                </p>
                <p className="teacher-card-meta mt-2 text-xs">{breakdownLabel}</p>
              </div>
              {breakdown ? (
                <p className="teacher-card-meta text-xs">
                  {breakdown.mode === "module"
                    ? `${breakdown.rows.length} batch row(s)`
                    : `${breakdown.rows.length} student row(s)`}
                </p>
              ) : null}
            </div>
          {breakdownLoading ? (
            <div className="teacher-card-copy mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm">
              Loading filtered breakdown...
            </div>
          ) : breakdownError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
              Error: {breakdownError}
            </div>
          ) : breakdown?.mode === "all" ? (
            breakdown.rows.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                <div className="overflow-x-auto">
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {breakdown.rows.map((row) => (
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
                            <p className="teacher-card-copy">
                              {formatDateTime(row.latest_attempt_at)}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No active students are available for the current table view yet.
              </div>
            )
          ) : breakdown?.mode === "batch" ? (
            breakdown.rows.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                <div className="overflow-x-auto">
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                        {breakdown.rows.map((row) => (
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
                            <p className="teacher-card-copy">
                              {formatDateTime(row.latest_attempt_at)}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              ) : (
                <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                  No saved activity attempts matched the selected batch yet.
                </div>
              )
            ) : breakdown?.mode === "module" ? (
              breakdown.rows.length ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                  <div className="overflow-x-auto">
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
                        {breakdown.rows.map((row) => (
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
                  </div>
                </div>
              ) : (
              <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No saved activity attempts matched the selected live module yet.
              </div>
            )
          ) : breakdown?.mode === "batch_module" ? (
            breakdown.rows.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                <div className="overflow-x-auto">
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {breakdown.rows.map((row) => (
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
                            <p className="teacher-card-copy">
                              {formatDateTime(row.latest_attempt_at)}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No saved activity attempts matched the selected batch and module yet.
              </div>
            )
          ) : (
            <div className="teacher-card-copy mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
              No breakdown data is available for the current filters.
            </div>
          )}
        </div>
        </div>

        {globalError ? (
          <div className="panel">
            <p className="text-sm text-red-700">Error: {globalError}</p>
          </div>
        ) : null}
      </section>

      <DetailDrawer
        activePanel={activePanel}
        attentionStudents={attentionStudents}
        onClose={() => setActivePanel(null)}
        weakItems={weakItems}
      />
    </>
  );
}
