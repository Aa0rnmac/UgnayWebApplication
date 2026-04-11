"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@/components/auth-context";
import { TeacherFilteredProgressBreakdown } from "@/components/teacher/filtered-progress-breakdown";
import { TeacherHandlingControls } from "@/components/teacher/teacher-handling-controls";
import {
  TeacherAttentionStudent,
  TeacherBatch,
  TeacherEnrollment,
  TeacherHandlingSession,
  TeacherPresence,
  TeacherReportSummary,
  TeacherUserSummary,
  archiveTeacherBatch,
  assignTeacherToBatch,
  createTeacherBatch,
  endTeacherHandlingSession,
  getAdminTeachers,
  getTeacherActiveSession,
  getTeacherBatchStudents,
  getTeacherBatches,
  getTeacherEnrollments,
  getTeacherModulesCatalog,
  getTeacherPresence,
  getTeacherReportSummary,
  restoreTeacherBatch,
  startTeacherHandlingSession,
  updateTeacherPresence,
} from "@/lib/api";

type BatchForm = {
  code: string;
  name: string;
  capacity: string;
  notes: string;
  primaryTeacherId: string;
};
type MessageTone = "success" | "warning";

const EMPTY_BATCH: BatchForm = { code: "", name: "", capacity: "", notes: "", primaryTeacherId: "" };
const PREVIEW_LIMIT = 5;

function statusLabel(status: TeacherBatch["status"]) {
  return status === "archived" ? "Archived" : "Active";
}

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

function getPreviewBadgeLabel(itemsLength: number) {
  if (itemsLength === 0) {
    return "No items";
  }
  return itemsLength > PREVIEW_LIMIT ? `Top ${PREVIEW_LIMIT}` : `Showing ${itemsLength}`;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) {
    return "No data";
  }
  return `${value.toFixed(digits)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "No activity yet";
  }
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
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

function StudentsAttentionDetailDrawer({
  isOpen,
  onClose,
  attentionStudents,
}: {
  isOpen: boolean;
  onClose: () => void;
  attentionStudents: TeacherAttentionStudent[];
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[220] overflow-y-auto bg-slate-950/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="relative flex min-h-full items-start justify-end p-3 md:p-6">
        <aside
          aria-label="Students Needing Attention"
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
                <h3 className="teacher-panel-heading mt-1 text-2xl font-black leading-tight">
                  Students Needing Attention
                </h3>
                <p className="teacher-card-meta mt-2 text-sm">
                  {attentionStudents.length} flagged student(s) across all active batches and all
                  modules.
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {attentionStudents.length ? (
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
                            {student.batch_name ?? "Unassigned batch"} - {student.attempt_count}{" "}
                            attempts
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
                        Average {formatPercent(student.average_score_percent, 2)} -{" "}
                        {student.low_score_count} low score(s) in the latest five attempts
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
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body
  );
}

export default function TeacherClassManagementPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [activeBatches, setActiveBatches] = useState<TeacherBatch[]>([]);
  const [archivedBatches, setArchivedBatches] = useState<TeacherBatch[]>([]);
  const [approvedEnrollments, setApprovedEnrollments] = useState<TeacherEnrollment[]>([]);
  const [studentsByBatch, setStudentsByBatch] = useState<Record<number, TeacherUserSummary[]>>({});
  const [teacherPresence, setTeacherPresence] = useState<TeacherPresence | null>(null);
  const [activeSession, setActiveSession] = useState<TeacherHandlingSession | null>(null);
  const [sessionMode, setSessionMode] = useState<"student" | "batch">("student");
  const [sessionBatchId, setSessionBatchId] = useState<string>("");
  const [sessionStudentId, setSessionStudentId] = useState<string>("");
  const [batchForm, setBatchForm] = useState<BatchForm>(EMPTY_BATCH);
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);
  const [showArchivedBatches, setShowArchivedBatches] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [loadingBatchId, setLoadingBatchId] = useState<number | null>(null);
  const [batchActionId, setBatchActionId] = useState<number | null>(null);
  const [teacherAssignBusyBatchId, setTeacherAssignBusyBatchId] = useState<number | null>(null);
  const [adminTeachers, setAdminTeachers] = useState<TeacherUserSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [reportSummary, setReportSummary] = useState<TeacherReportSummary | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isStudentsAttentionOpen, setIsStudentsAttentionOpen] = useState(false);
  const [managedStudentCount, setManagedStudentCount] = useState(0);

  const visibleBatches = useMemo(
    () => [...activeBatches, ...(showArchivedBatches ? archivedBatches : [])],
    [activeBatches, archivedBatches, showArchivedBatches]
  );

  const sessionStudents = useMemo(() => {
    const base = approvedEnrollments
      .filter((enrollment) => enrollment.student !== null)
      .filter((enrollment) =>
        sessionBatchId ? String(enrollment.batch?.id ?? "") === sessionBatchId : true
      )
      .map((enrollment) => enrollment.student)
      .filter((student): student is TeacherUserSummary => student !== null);
    const seen = new Set<number>();
    return base.filter((student) => {
      if (seen.has(student.id)) {
        return false;
      }
      seen.add(student.id);
      return true;
    });
  }, [approvedEnrollments, sessionBatchId]);

  const activeBatchCount = activeBatches.length;
  const approvedStudentCount = useMemo(() => {
    const seen = new Set<number>();
    approvedEnrollments.forEach((enrollment) => {
      if (enrollment.student) {
        seen.add(enrollment.student.id);
      }
    });
    return seen.size;
  }, [approvedEnrollments]);
  const attentionStudents = reportSummary?.students_needing_attention ?? [];

  async function loadClassManagement() {
    setLoading(true);
    setPageError(null);
    try {
      const [
        nextActiveBatches,
        nextArchivedBatches,
        nextApprovedEnrollments,
        nextPresence,
        nextActiveSession,
        nextModulesCatalog,
        nextAdminTeachers,
      ] =
        await Promise.all([
          getTeacherBatches({ status: "active" }),
          showArchivedBatches
            ? getTeacherBatches({ status: "archived" })
            : Promise.resolve([] as TeacherBatch[]),
          getTeacherEnrollments({ status: "approved" }),
          getTeacherPresence(),
          getTeacherActiveSession(),
          getTeacherModulesCatalog(),
          isAdmin ? getAdminTeachers() : Promise.resolve([] as TeacherUserSummary[]),
        ]);

      setActiveBatches(nextActiveBatches);
      setArchivedBatches(nextArchivedBatches);
      setApprovedEnrollments(nextApprovedEnrollments);
      setTeacherPresence(nextPresence);
      setActiveSession(nextActiveSession);
      setManagedStudentCount(nextModulesCatalog.managed_student_count);
      setAdminTeachers(nextAdminTeachers);

      const visibleBatchIds = new Set(
        [...nextActiveBatches, ...nextArchivedBatches].map((batch) => batch.id)
      );
      if (expandedBatchId !== null && !visibleBatchIds.has(expandedBatchId)) {
        setExpandedBatchId(null);
      }
    } catch (requestError) {
      setPageError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load class management."
      );
    } finally {
      setLoading(false);
    }
  }

  const refreshTeacherRuntime = async () => {
    const [nextPresence, nextActiveSession] = await Promise.all([
      getTeacherPresence(),
      getTeacherActiveSession(),
    ]);
    setTeacherPresence(nextPresence);
    setActiveSession(nextActiveSession);
  };

  useEffect(() => {
    void loadClassManagement();
  }, [isAdmin, showArchivedBatches]);

  useEffect(() => {
    let isActive = true;
    void (async () => {
      try {
        setReportLoading(true);
        setReportError(null);
        const nextSummary = await getTeacherReportSummary();
        if (!isActive) {
          return;
        }
        setReportSummary(nextSummary);
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setReportError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load student attention summary."
        );
      } finally {
        if (isActive) {
          setReportLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isStudentsAttentionOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsStudentsAttentionOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isStudentsAttentionOpen]);

  useEffect(() => {
    if (sessionMode === "batch") {
      setSessionStudentId("");
    }
  }, [sessionMode]);

  useEffect(() => {
    if (!sessionBatchId) {
      return;
    }
    if (
      sessionStudentId &&
      !sessionStudents.some((student) => String(student.id) === sessionStudentId)
    ) {
      setSessionStudentId("");
    }
  }, [sessionBatchId, sessionStudentId, sessionStudents]);

  const handleTogglePresence = async (nextStatus: "online" | "offline") => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const nextPresence = await updateTeacherPresence({ status: nextStatus });
      setTeacherPresence(nextPresence);
      if (nextStatus === "offline") {
        setActiveSession(null);
      } else {
        await refreshTeacherRuntime();
      }
    } catch (requestError) {
      setSessionError(
        requestError instanceof Error ? requestError.message : "Unable to update presence."
      );
    } finally {
      setSessionBusy(false);
    }
  };

  const handleStartSession = async () => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const nextSession = await startTeacherHandlingSession({
        batch_id:
          sessionMode === "batch" && sessionBatchId
            ? Number(sessionBatchId)
            : sessionBatchId
              ? Number(sessionBatchId)
              : null,
        student_id: sessionMode === "student" && sessionStudentId ? Number(sessionStudentId) : null,
      });
      setActiveSession(nextSession);
      await refreshTeacherRuntime();
    } catch (requestError) {
      setSessionError(
        requestError instanceof Error ? requestError.message : "Unable to start handling session."
      );
    } finally {
      setSessionBusy(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) {
      return;
    }
    setSessionBusy(true);
    setSessionError(null);
    try {
      await endTeacherHandlingSession(activeSession.id);
      setActiveSession(null);
      await refreshTeacherRuntime();
    } catch (requestError) {
      setSessionError(
        requestError instanceof Error ? requestError.message : "Unable to end handling session."
      );
    } finally {
      setSessionBusy(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!batchForm.code.trim() || !batchForm.name.trim()) {
      setPageError("Batch code and name are required.");
      return;
    }
    setCreatingBatch(true);
    setPageError(null);
    setMessage(null);
    setMessageTone("success");
    try {
      await createTeacherBatch({
        code: batchForm.code.trim(),
        name: batchForm.name.trim(),
        capacity: batchForm.capacity ? Number(batchForm.capacity) : null,
        notes: batchForm.notes.trim() || null,
        primary_teacher_id:
          isAdmin && batchForm.primaryTeacherId ? Number(batchForm.primaryTeacherId) : null,
      });
      setBatchForm(EMPTY_BATCH);
      setMessageTone("success");
      setMessage("Batch created successfully.");
      await loadClassManagement();
    } catch (requestError) {
      setPageError(requestError instanceof Error ? requestError.message : "Unable to create batch.");
    } finally {
      setCreatingBatch(false);
    }
  };

  const toggleBatch = async (batchId: number) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      return;
    }

    setExpandedBatchId(batchId);
    if (studentsByBatch[batchId]) {
      return;
    }

    setLoadingBatchId(batchId);
    try {
      const students = await getTeacherBatchStudents(batchId);
      setStudentsByBatch((previous) => ({ ...previous, [batchId]: students }));
    } catch (requestError) {
      setPageError(
        requestError instanceof Error ? requestError.message : "Unable to load batch roster."
      );
    } finally {
      setLoadingBatchId(null);
    }
  };

  const handleBatchStatusChange = async (batch: TeacherBatch) => {
    setBatchActionId(batch.id);
    setPageError(null);
    setMessage(null);
    setMessageTone("success");
    try {
      if (batch.status === "archived") {
        await restoreTeacherBatch(batch.id);
        setMessage(`${batch.name} restored to active batches.`);
      } else {
        await archiveTeacherBatch(batch.id);
        setMessage(`${batch.name} archived. Historical records remain available.`);
      }
      await loadClassManagement();
    } catch (requestError) {
      setPageError(
        requestError instanceof Error ? requestError.message : "Unable to update batch status."
      );
    } finally {
      setBatchActionId(null);
    }
  };

  const handleAssignTeacherToBatch = async (batchId: number, teacherId: number) => {
    setTeacherAssignBusyBatchId(batchId);
    setPageError(null);
    setMessage(null);
    setMessageTone("success");
    try {
      await assignTeacherToBatch(batchId, { teacher_id: teacherId });
      setMessage("Batch teacher updated successfully.");
      await loadClassManagement();
    } catch (requestError) {
      setPageError(
        requestError instanceof Error ? requestError.message : "Unable to assign teacher to batch."
      );
    } finally {
      setTeacherAssignBusyBatchId(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Class Management
          </p>
          <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
            {isAdmin
              ? "Manage batches, assign teachers, and monitor class ownership."
              : "Manage teacher runtime, active batches, and live class rosters."}
          </h2>
          <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
            {isAdmin
              ? "Use this workspace to align batches with the right teachers. Enrollment approval is handled in Enrollment Approval."
              : "This workspace now owns teacher availability, handling sessions, batch creation, and roster visibility so the enrollment page can stay focused on approvals and payment review."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Student Count
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : managedStudentCount}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm uppercase tracking-[0.2em]">
            {isAdmin ? "Students across all active batches" : "Students currently managed by you"}
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Teacher Status
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {teacherPresence ? teacherPresence.status : loading ? "..." : "offline"}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Presence controls whether runtime handling can be started for class work.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Active Batches
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : activeBatchCount}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Batches currently available for approvals and batch-wide runtime sessions.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Approved Students
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : approvedStudentCount}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Student records available for roster review and teacher-specific handling sessions.
          </p>
        </div>
      </div>

      {reportLoading ? (
        <div className="teacher-card-copy rounded-2xl border border-black/10 bg-black/5 px-4 py-4 text-sm">
          Refreshing student attention summary...
        </div>
      ) : null}

      <div className="mt-1">
        <AlertSummaryCard
          accentClassName="text-brandGreen"
          badge={getPreviewBadgeLabel(attentionStudents.length)}
          disabled={reportLoading || attentionStudents.length === 0}
          emptyMessage="No students are currently flagged across active batches and modules."
          footerLabel="View all students"
          onOpen={() => setIsStudentsAttentionOpen(true)}
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

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold text-slate-800 ${
            messageTone === "success"
              ? "border-brandGreen/30 bg-brandGreenLight"
              : "border-accent/30 bg-brandYellowLight"
          }`}
        >
          {message}
        </div>
      ) : null}

      {reportError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {reportError}
        </div>
      ) : null}

      {!isAdmin ? (
        <TeacherHandlingControls
          activeSession={activeSession}
          batches={activeBatches}
          onBatchChange={setSessionBatchId}
          onEndSession={() => void handleEndSession()}
          onModeChange={setSessionMode}
          onStartSession={() => void handleStartSession()}
          onStudentChange={setSessionStudentId}
          onTogglePresence={(nextStatus) => void handleTogglePresence(nextStatus)}
          presence={teacherPresence}
          sessionBatchId={sessionBatchId}
          sessionBusy={sessionBusy}
          sessionError={sessionError}
          sessionMode={sessionMode}
          sessionStudentId={sessionStudentId}
          students={sessionStudents}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.92fr,1.08fr]">
        <div className="space-y-4">
          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
              Create Batch
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                className="teacher-card-control"
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, code: event.target.value }))
                }
                placeholder="Batch code"
                value={batchForm.code}
              />
              <input
                className="teacher-card-control"
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, name: event.target.value }))
                }
                placeholder="Batch name"
                value={batchForm.name}
              />
              <input
                className="teacher-card-control"
                min="1"
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, capacity: event.target.value }))
                }
                placeholder="Capacity"
                type="number"
                value={batchForm.capacity}
              />
              <input
                className="teacher-card-control"
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, notes: event.target.value }))
                }
                placeholder="Notes"
                value={batchForm.notes}
              />
              {isAdmin ? (
                <select
                  className="teacher-card-control"
                  onChange={(event) =>
                    setBatchForm((previous) => ({ ...previous, primaryTeacherId: event.target.value }))
                  }
                  value={batchForm.primaryTeacherId}
                >
                  <option value="">Assign teacher later</option>
                  {adminTeachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.full_name} ({teacher.username})
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <button
              className="mt-4 rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:opacity-60"
              disabled={creatingBatch}
              onClick={() => void handleCreateBatch()}
              type="button"
            >
              {creatingBatch ? "Creating..." : "Create Batch"}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                Batch Roster
              </p>
              <p className="teacher-card-meta mt-2 text-xs">
                {showArchivedBatches
                  ? `${activeBatches.length} active batch(es) and ${archivedBatches.length} archived batch(es) in view.`
                  : `${activeBatches.length} active batch(es) ready for approvals.`}
              </p>
            </div>
            <label className="teacher-card-copy flex items-center gap-2 text-sm font-semibold">
              <input
                checked={showArchivedBatches}
                onChange={(event) => setShowArchivedBatches(event.target.checked)}
                type="checkbox"
              />
              Show Archived
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {visibleBatches.length ? (
              visibleBatches.map((batch) => {
                const expanded = expandedBatchId === batch.id;
                const students = studentsByBatch[batch.id] ?? [];
                const batchActionBusy = batchActionId === batch.id;

                return (
                  <article
                    key={batch.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="teacher-card-title text-lg font-black">{batch.name}</p>
                          {batch.status === "archived" ? (
                            <span className="rounded-full border border-black/10 bg-brandYellowLight px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brandNavy">
                              Archived
                            </span>
                          ) : null}
                        </div>
                        <p className="teacher-card-meta mt-1 text-xs uppercase tracking-[0.2em]">
                          {batch.code}
                        </p>
                      </div>
                      <button
                        className="teacher-card-ghost-button rounded-lg border px-3 py-2 text-xs font-semibold transition"
                        onClick={() => void toggleBatch(batch.id)}
                        type="button"
                      >
                        {expanded ? "Hide Roster" : "Open Roster"}
                      </button>
                    </div>

                    <p className="teacher-card-copy mt-3 text-sm">
                      {batch.student_count} student(s) - {statusLabel(batch.status)}
                    </p>
                    <p className="teacher-card-meta mt-2 text-xs">
                      Primary teacher: {batch.primary_teacher?.full_name ?? "Not assigned"}
                    </p>

                    {expanded ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="teacher-card-title text-sm font-black">
                              {batch.status === "archived"
                                ? "Archived batches stay read-only for new approvals."
                                : "Active batches can accept new approvals."}
                            </p>
                            <p className="teacher-card-meta mt-1 text-xs">
                              {batch.status === "archived"
                                ? "Restore this batch if you want to assign new students to it again."
                                : "Archive this batch when you want to preserve history without keeping it available for new approvals."}
                            </p>
                          </div>
                          <button
                            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
                              batch.status === "archived"
                                ? "bg-brandBlue hover:bg-brandBlue/90"
                                : "bg-brandRed hover:bg-brandRed/90"
                            }`}
                            disabled={batchActionBusy}
                            onClick={() => void handleBatchStatusChange(batch)}
                            type="button"
                          >
                            {batchActionBusy
                              ? "Saving..."
                              : batch.status === "archived"
                                ? "Restore Batch"
                                : "Archive Batch"}
                          </button>
                        </div>

                        {isAdmin ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <select
                              className="teacher-card-control max-w-sm"
                              value={batch.primary_teacher?.id ? String(batch.primary_teacher.id) : ""}
                              disabled={teacherAssignBusyBatchId === batch.id}
                              onChange={(event) => {
                                const nextTeacherId = Number(event.target.value);
                                if (!nextTeacherId || nextTeacherId === batch.primary_teacher?.id) {
                                  return;
                                }
                                void handleAssignTeacherToBatch(batch.id, nextTeacherId);
                              }}
                            >
                              <option value="">Select teacher</option>
                              {adminTeachers.map((teacher) => (
                                <option key={teacher.id} value={teacher.id}>
                                  {teacher.full_name} ({teacher.username})
                                </option>
                              ))}
                            </select>
                            <p className="teacher-card-meta text-xs">
                              {teacherAssignBusyBatchId === batch.id
                                ? "Updating batch teacher..."
                                : "Admin can reassign this batch to a different teacher."}
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-4">
                          {loadingBatchId === batch.id ? (
                            <p className="teacher-card-copy text-sm">Loading roster...</p>
                          ) : students.length ? (
                            <div className="space-y-3">
                              {students.map((student) => (
                                <div
                                  key={student.id}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                                >
                                  <div>
                                    <p className="teacher-card-title text-sm font-black">
                                      {student.full_name}
                                    </p>
                                    <p className="teacher-card-meta mt-1 text-xs">
                                      {student.email ?? student.username}
                                    </p>
                                  </div>
                                  <Link
                                    className="rounded-lg bg-brandGreen px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandGreen/90"
                                    href={`/teacher/students/${student.id}`}
                                  >
                                    Open Student
                                  </Link>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="teacher-card-copy text-sm">
                              No approved students in this batch yet.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                {showArchivedBatches
                  ? "No active or archived batches yet. Create one first so pending students can be assigned."
                  : "No active batches yet. Create one first so pending students can be assigned."}
              </div>
            )}
          </div>
        </div>
      </div>

      <TeacherFilteredProgressBreakdown />

      {pageError ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {pageError}</p>
        </div>
      ) : null}

      <StudentsAttentionDetailDrawer
        attentionStudents={attentionStudents}
        isOpen={isStudentsAttentionOpen}
        onClose={() => setIsStudentsAttentionOpen(false)}
      />
    </section>
  );
}
