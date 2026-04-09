"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  TeacherBatch,
  TeacherEnrollment,
  TeacherEnrollmentApprovalResult,
  TeacherEnrollmentRejectionResult,
  TeacherUserSummary,
  approveTeacherEnrollment,
  archiveTeacherBatch,
  createTeacherBatch,
  getTeacherBatchStudents,
  getTeacherBatches,
  getTeacherEnrollmentPaymentProof,
  getTeacherEnrollments,
  rejectTeacherEnrollment,
  restoreTeacherBatch,
} from "@/lib/api";

type BatchForm = { code: string; name: string; capacity: string; notes: string };
type RejectionReasonCode = NonNullable<TeacherEnrollment["rejection_reason_code"]>;
type ReviewDraft = {
  batchId: string;
  internalNote: string;
  sendEmail: boolean;
  rejectionReasonCode: RejectionReasonCode | "";
  rejectionReasonDetail: string;
  internalNoteManuallyEdited: boolean;
};

const EMPTY_BATCH: BatchForm = { code: "", name: "", capacity: "", notes: "" };
type MessageTone = "success" | "warning";
const REJECTION_REASON_OPTIONS: Array<{
  value: RejectionReasonCode;
  label: string;
  description: string;
}> = [
  {
    value: "incorrect_amount_paid",
    label: "Incorrect amount paid",
    description: "Use when the submitted payment amount does not match the required amount.",
  },
  {
    value: "incorrect_information",
    label: "Incorrect information",
    description: "Use when the submitted details are incorrect, incomplete, or cannot be verified.",
  },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function fullName(enrollment: TeacherEnrollment) {
  if (enrollment.student?.full_name) return enrollment.student.full_name;
  const registration = enrollment.registration;
  return [registration.first_name, registration.middle_name, registration.last_name]
    .filter(Boolean)
    .join(" ");
}

function tone(status: string) {
  if (status === "approved") return "border-brandGreen/30 bg-brandGreenLight text-brandGreen";
  if (status === "rejected") return "border-brandRed/30 bg-brandRedLight text-brandRed";
  return "border-accent/30 bg-brandYellowLight text-brandNavy";
}

function statusLabel(status: TeacherBatch["status"]) {
  return status === "archived" ? "Archived" : "Active";
}

function rejectionReasonLabel(reasonCode: RejectionReasonCode | "" | null | undefined) {
  return REJECTION_REASON_OPTIONS.find((option) => option.value === reasonCode)?.label ?? "No email reason selected";
}

function defaultDraft(batches: TeacherBatch[]): ReviewDraft {
  return {
    batchId: batches.length === 1 ? String(batches[0].id) : "",
    internalNote: "",
    sendEmail: true,
    rejectionReasonCode: "",
    rejectionReasonDetail: "",
    internalNoteManuallyEdited: false,
  };
}

export default function TeacherClassesPage() {
  const [activeBatches, setActiveBatches] = useState<TeacherBatch[]>([]);
  const [archivedBatches, setArchivedBatches] = useState<TeacherBatch[]>([]);
  const [pending, setPending] = useState<TeacherEnrollment[]>([]);
  const [approved, setApproved] = useState<TeacherEnrollment[]>([]);
  const [rejected, setRejected] = useState<TeacherEnrollment[]>([]);
  const [studentsByBatch, setStudentsByBatch] = useState<Record<number, TeacherUserSummary[]>>({});
  const [drafts, setDrafts] = useState<Record<number, ReviewDraft>>({});
  const [batchForm, setBatchForm] = useState<BatchForm>(EMPTY_BATCH);
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);
  const [showArchivedBatches, setShowArchivedBatches] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loadingBatchId, setLoadingBatchId] = useState<number | null>(null);
  const [proofId, setProofId] = useState<number | null>(null);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchActionId, setBatchActionId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [error, setError] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<TeacherEnrollmentApprovalResult | null>(null);

  const visibleBatches = useMemo(
    () => [...activeBatches, ...(showArchivedBatches ? archivedBatches : [])],
    [activeBatches, archivedBatches, showArchivedBatches]
  );
  const recentApproved = useMemo(() => approved.slice(0, 4), [approved]);
  const recentRejected = useMemo(() => rejected.slice(0, 4), [rejected]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [nextActiveBatches, nextArchivedBatches, nextPending, nextApproved, nextRejected] =
        await Promise.all([
          getTeacherBatches({ status: "active" }),
          showArchivedBatches
            ? getTeacherBatches({ status: "archived" })
            : Promise.resolve([] as TeacherBatch[]),
          getTeacherEnrollments({ status: "pending" }),
          getTeacherEnrollments({ status: "approved" }),
          getTeacherEnrollments({ status: "rejected" }),
        ]);

      setActiveBatches(nextActiveBatches);
      setArchivedBatches(nextArchivedBatches);
      setPending(nextPending);
      setApproved(nextApproved);
      setRejected(nextRejected);

      const activeBatchIds = new Set(nextActiveBatches.map((batch) => String(batch.id)));
      const visibleBatchIds = new Set(
        [...nextActiveBatches, ...nextArchivedBatches].map((batch) => batch.id)
      );

      setDrafts((previous) => {
      const next: Record<number, ReviewDraft> = {};
      const fallbackDraft = defaultDraft(nextActiveBatches);

        for (const item of nextPending) {
          const existing = previous[item.id];
          const existingBatchStillValid =
            !!existing?.batchId && activeBatchIds.has(existing.batchId);

          next[item.id] = existingBatchStillValid
            ? existing
            : {
                ...(existing ?? fallbackDraft),
                batchId: existingBatchStillValid ? existing.batchId : fallbackDraft.batchId,
              };
        }
        return next;
      });

      if (expandedBatchId !== null && !visibleBatchIds.has(expandedBatchId)) {
        setExpandedBatchId(null);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load enrollments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [showArchivedBatches]);

  function updateDraft<K extends keyof ReviewDraft>(
    enrollmentId: number,
    key: K,
    value: ReviewDraft[K]
  ) {
    setDrafts((previous) => ({
      ...previous,
      [enrollmentId]: { ...(previous[enrollmentId] ?? defaultDraft(activeBatches)), [key]: value },
    }));
  }

  function handleInternalNoteChange(enrollmentId: number, value: string) {
    setDrafts((previous) => ({
      ...previous,
      [enrollmentId]: {
        ...(previous[enrollmentId] ?? defaultDraft(activeBatches)),
        internalNote: value,
        internalNoteManuallyEdited: true,
      },
    }));
  }

  function handleRejectionReasonChange(enrollmentId: number, value: RejectionReasonCode) {
    setDrafts((previous) => {
      const current = previous[enrollmentId] ?? defaultDraft(activeBatches);
      return {
        ...previous,
        [enrollmentId]: {
          ...current,
          rejectionReasonCode: value,
          internalNote: current.internalNoteManuallyEdited ? current.internalNote : rejectionReasonLabel(value),
        },
      };
    });
  }

  async function handleCreateBatch() {
    if (!batchForm.code.trim() || !batchForm.name.trim()) {
      setError("Batch code and name are required.");
      return;
    }
    setCreatingBatch(true);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      await createTeacherBatch({
        code: batchForm.code.trim(),
        name: batchForm.name.trim(),
        capacity: batchForm.capacity ? Number(batchForm.capacity) : null,
        notes: batchForm.notes.trim() || null,
      });
      setBatchForm(EMPTY_BATCH);
      setMessageTone("success");
      setMessage("Batch created successfully.");
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create batch.");
    } finally {
      setCreatingBatch(false);
    }
  }

  async function handleApprove(enrollmentId: number) {
    const draft = drafts[enrollmentId] ?? defaultDraft(activeBatches);
    if (!draft.batchId) {
      setError("Select an active batch before approving this enrollment.");
      return;
    }
    setBusyId(enrollmentId);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      const approval = await approveTeacherEnrollment(enrollmentId, {
        batch_id: Number(draft.batchId),
        notes: draft.internalNote.trim() || null,
        send_email: draft.sendEmail,
      });
      setApprovalResult(approval);
      setMessageTone(approval.delivery_status === "sent" ? "success" : "warning");
      setMessage(approval.delivery_message);
      await loadData();
    } catch (requestError) {
      setApprovalResult(null);
      setError(requestError instanceof Error ? requestError.message : "Unable to approve enrollment.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(enrollmentId: number) {
    const draft = drafts[enrollmentId] ?? defaultDraft(activeBatches);
    if (!draft.rejectionReasonCode) {
      setError("Select an applicant email reason before rejecting this enrollment.");
      return;
    }
    setBusyId(enrollmentId);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      const rejection: TeacherEnrollmentRejectionResult = await rejectTeacherEnrollment(enrollmentId, {
        internal_note: draft.internalNote.trim() || null,
        rejection_reason_code: draft.rejectionReasonCode,
        rejection_reason_detail: draft.rejectionReasonDetail.trim() || null,
      });
      setMessageTone(rejection.delivery_status === "sent" ? "success" : "warning");
      setMessage(rejection.delivery_message);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reject enrollment.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleViewProof(enrollmentId: number) {
    const popup = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setProofId(enrollmentId);
    setError(null);
    try {
      const blob = await getTeacherEnrollmentPaymentProof(enrollmentId);
      const url = window.URL.createObjectURL(blob);
      if (popup) popup.location.href = url;
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      popup?.close();
      setError(requestError instanceof Error ? requestError.message : "Unable to open payment proof.");
    } finally {
      setProofId(null);
    }
  }

  async function toggleBatch(batchId: number) {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      return;
    }

    setExpandedBatchId(batchId);
    if (studentsByBatch[batchId]) return;

    setLoadingBatchId(batchId);
    try {
      const students = await getTeacherBatchStudents(batchId);
      setStudentsByBatch((previous) => ({ ...previous, [batchId]: students }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load batch roster.");
    } finally {
      setLoadingBatchId(null);
    }
  }

  async function handleBatchStatusChange(batch: TeacherBatch) {
    setBatchActionId(batch.id);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      if (batch.status === "archived") {
        await restoreTeacherBatch(batch.id);
        setMessageTone("success");
        setMessage(`${batch.name} restored to active batches.`);
      } else {
        await archiveTeacherBatch(batch.id);
        setMessageTone("success");
        setMessage(`${batch.name} archived. Historical records remain available.`);
      }
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to update batch status."
      );
    } finally {
      setBatchActionId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            Enrollment Operations
          </p>
          <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
            Approve learners, assign batches, and manage live or archived rosters.
          </h2>
          <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
            Review payment proofs, approve or reject registrants, create batches, and archive old
            groups without losing their student history.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">Pending</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{pending.length}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Registrations waiting for teacher review.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Approved
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{approved.length}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Students with active enrollment records.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Batches</p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{activeBatches.length}</p>
          <p className="teacher-panel-copy mt-2 text-sm">Active batches ready for assignment.</p>
        </div>
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

      {approvalResult ? (
        <div
          className={`rounded-2xl border px-4 py-4 text-sm ${
            approvalResult.delivery_status === "sent"
              ? "border-brandGreen/30 bg-brandGreenLight text-slate-900"
              : "border-accent/30 bg-brandYellowLight text-slate-900"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.25em]">Student Credentials</p>
          <p className="mt-3">
            Recipient Email: <span className="font-semibold">{approvalResult.recipient_email}</span>
          </p>
          <p className="mt-2">
            Delivery Status:{" "}
            <span className="font-semibold uppercase">{approvalResult.delivery_status}</span>
          </p>
          <p className="mt-2">
            Username: <span className="font-semibold">{approvalResult.issued_username}</span>
          </p>
          {approvalResult.delivery_status !== "sent" ? (
            <p className="mt-2">
              Temporary Password:{" "}
              <span className="font-semibold">{approvalResult.temporary_password}</span>
            </p>
          ) : null}
          <p className="mt-3 text-xs text-slate-700">
            {approvalResult.delivery_status === "sent"
              ? "Credentials were emailed successfully. The temporary password is hidden here to avoid unnecessary exposure."
              : "Share this only with the student if needed. The password is shown here once and should be changed after first login."}
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading enrollment operations...</p>
        </div>
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
                placeholder="Batch code"
                value={batchForm.code}
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, code: event.target.value }))
                }
              />
              <input
                className="teacher-card-control"
                placeholder="Batch name"
                value={batchForm.name}
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, name: event.target.value }))
                }
              />
              <input
                className="teacher-card-control"
                min="1"
                placeholder="Capacity"
                type="number"
                value={batchForm.capacity}
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, capacity: event.target.value }))
                }
              />
              <input
                className="teacher-card-control"
                placeholder="Notes"
                value={batchForm.notes}
                onChange={(event) =>
                  setBatchForm((previous) => ({ ...previous, notes: event.target.value }))
                }
              />
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

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
            Pending Queue
          </p>
          <div className="mt-4 space-y-4">
            {pending.length ? (
              pending.map((enrollment) => {
                const draft = drafts[enrollment.id] ?? defaultDraft(activeBatches);
                const busy = busyId === enrollment.id;

                return (
                  <article
                    key={enrollment.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="teacher-card-title text-lg font-black">{fullName(enrollment)}</p>
                        <p className="teacher-card-copy mt-1 text-sm">
                          {enrollment.registration.email} - {enrollment.registration.phone_number}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${tone(enrollment.status)}`}
                      >
                        {enrollment.status}
                      </span>
                    </div>
                    <p className="teacher-card-meta mt-3 text-xs">
                      Reference #{enrollment.registration.reference_number} - Submitted{" "}
                      {formatDateTime(enrollment.created_at)}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <select
                        className="teacher-card-control"
                        value={draft.batchId}
                        onChange={(event) =>
                          updateDraft(enrollment.id, "batchId", event.target.value)
                        }
                      >
                        <option value="">Select active batch</option>
                        {activeBatches.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {batch.name} ({batch.code})
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="teacher-card-control min-h-24"
                        placeholder="Internal teacher note for approval or rejection (not emailed)"
                        value={draft.internalNote}
                        onChange={(event) => handleInternalNoteChange(enrollment.id, event.target.value)}
                      />
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brandRed">
                        Rejection Email Reason
                      </p>
                      <div className="mt-3 grid gap-2">
                        {REJECTION_REASON_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className="flex gap-3 rounded-xl border border-black/10 bg-black/5 px-3 py-3 text-sm"
                          >
                            <input
                              checked={draft.rejectionReasonCode === option.value}
                              name={`rejection-reason-${enrollment.id}`}
                              onChange={() => handleRejectionReasonChange(enrollment.id, option.value)}
                              type="radio"
                              value={option.value}
                            />
                            <span>
                              <span className="block font-semibold text-slate-900">{option.label}</span>
                              <span className="teacher-card-meta mt-1 block text-xs">
                                {option.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <textarea
                        className="teacher-card-control mt-3 min-h-20"
                        placeholder="Optional applicant-facing details to include in the rejection email"
                        value={draft.rejectionReasonDetail}
                        onChange={(event) =>
                          updateDraft(enrollment.id, "rejectionReasonDetail", event.target.value)
                        }
                      />
                    </div>
                    <label className="teacher-card-copy mt-3 flex items-center gap-2 text-sm">
                      <input
                        checked={draft.sendEmail}
                        onChange={(event) =>
                          updateDraft(enrollment.id, "sendEmail", event.target.checked)
                        }
                        type="checkbox"
                      />
                      Send initial credentials by email now
                    </label>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="teacher-card-ghost-button rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
                        disabled={proofId === enrollment.id}
                        onClick={() => void handleViewProof(enrollment.id)}
                        type="button"
                      >
                        {proofId === enrollment.id ? "Opening..." : "View Proof"}
                      </button>
                      <button
                        className="rounded-xl bg-brandGreen px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandGreen/90 disabled:opacity-60"
                        disabled={busy || !activeBatches.length}
                        onClick={() => void handleApprove(enrollment.id)}
                        type="button"
                      >
                        {busy ? "Saving..." : "Approve"}
                      </button>
                      <button
                        className="rounded-xl bg-brandRed px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandRed/90 disabled:opacity-60"
                        disabled={busy || !draft.rejectionReasonCode}
                        onClick={() => void handleReject(enrollment.id)}
                        type="button"
                      >
                        {busy ? "Saving..." : "Reject"}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No pending enrollments right now.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Recently Approved
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {recentApproved.length ? (
              recentApproved.map((enrollment) => (
                <article
                  key={enrollment.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="teacher-card-title text-sm font-black">
                    {enrollment.student?.full_name ?? fullName(enrollment)}
                  </p>
                  <p className="teacher-card-meta mt-1 text-xs">
                    {enrollment.batch?.name ?? "Batch pending"}
                  </p>
                  <p className="teacher-card-meta mt-3 text-xs">
                    Approved {formatDateTime(enrollment.approved_at)}
                  </p>
                  {enrollment.student ? (
                    <Link
                      className="mt-4 inline-flex rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
                      href={`/teacher/students/${enrollment.student.id}`}
                    >
                      Open Student
                    </Link>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No approved enrollments yet.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandRed">
            Recently Rejected
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {recentRejected.length ? (
              recentRejected.map((enrollment) => (
                <article
                  key={enrollment.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="teacher-card-title text-sm font-black">{fullName(enrollment)}</p>
                  <p className="teacher-card-meta mt-3 text-xs">
                    Rejected {formatDateTime(enrollment.rejected_at)}
                  </p>
                  <p className="teacher-card-copy mt-3 text-sm">
                    <span className="font-semibold">Internal note:</span>{" "}
                    {enrollment.review_notes?.trim() || "No internal note was saved."}
                  </p>
                  <p className="teacher-card-copy mt-2 text-sm">
                    <span className="font-semibold">Email reason:</span>{" "}
                    {rejectionReasonLabel(enrollment.rejection_reason_code)}
                  </p>
                  {enrollment.rejection_reason_detail?.trim() ? (
                    <p className="teacher-card-meta mt-2 text-xs">
                      Applicant details: {enrollment.rejection_reason_detail.trim()}
                    </p>
                  ) : null}
                  <button
                    className="teacher-card-ghost-button mt-4 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
                    disabled={proofId === enrollment.id}
                    onClick={() => void handleViewProof(enrollment.id)}
                    type="button"
                  >
                    {proofId === enrollment.id ? "Opening..." : "View Proof"}
                  </button>
                </article>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No rejected enrollments yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
