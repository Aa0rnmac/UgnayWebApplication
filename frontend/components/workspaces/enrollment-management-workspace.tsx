"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  approveTeacherEnrollmentManagementRequest,
  TeacherBatch,
  TeacherEnrollment,
  TeacherEnrollmentApprovalResult,
  TeacherEnrollmentRejectionResult,
  approveTeacherEnrollment,
  assignTeacherEnrollmentBatch,
  getTeacherBatches,
  getTeacherEnrollmentPaymentProof,
  getTeacherEnrollments,
  rejectTeacherEnrollmentManagementRequest,
  rejectTeacherEnrollment,
  requestTeacherEnrollmentManagement,
} from "@/lib/api";
import { useAuth } from "@/components/auth-context";

type RejectionReasonCode = NonNullable<TeacherEnrollment["rejection_reason_code"]>;
type ReviewDraft = {
  batchId: string;
  internalNote: string;
  sendEmail: boolean;
  rejectionReasonCode: RejectionReasonCode | "";
  rejectionReasonDetail: string;
  internalNoteManuallyEdited: boolean;
};

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

function requestStatusTone(status: TeacherEnrollment["teacher_assignment_request_status"]) {
  if (status === "approved") return "border-brandGreen/30 bg-brandGreenLight text-brandGreen";
  if (status === "rejected") return "border-brandRed/30 bg-brandRedLight text-brandRed";
  if (status === "pending") return "border-accent/30 bg-brandYellowLight text-brandNavy";
  return "border-white/20 bg-white/5 text-slate-700";
}

function requestStatusLabel(status: TeacherEnrollment["teacher_assignment_request_status"]) {
  if (status === "approved") return "Request approved";
  if (status === "rejected") return "Request rejected";
  if (status === "pending") return "Request pending";
  return "No request";
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

export function EnrollmentManagementWorkspace() {
  const { id: currentUserId, role } = useAuth();
  const isAdmin = role === "admin";
  const [activeBatches, setActiveBatches] = useState<TeacherBatch[]>([]);
  const [pending, setPending] = useState<TeacherEnrollment[]>([]);
  const [approved, setApproved] = useState<TeacherEnrollment[]>([]);
  const [rejected, setRejected] = useState<TeacherEnrollment[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ReviewDraft>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [proofId, setProofId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [error, setError] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<TeacherEnrollmentApprovalResult | null>(null);
  const unassignedApproved = useMemo(
    () => approved.filter((enrollment) => enrollment.batch === null),
    [approved]
  );
  const enrolledWithoutTeacher = useMemo(
    () =>
      approved.filter(
        (enrollment) =>
          enrollment.batch === null || enrollment.batch.primary_teacher === null
      ),
    [approved]
  );
  const pendingManagementRequests = useMemo(
    () =>
      unassignedApproved.filter(
        (enrollment) => enrollment.teacher_assignment_request_status === "pending"
      ),
    [unassignedApproved]
  );
  const myPendingManagementRequests = useMemo(
    () =>
      pendingManagementRequests.filter(
        (enrollment) => enrollment.requested_teacher?.id === currentUserId
      ),
    [currentUserId, pendingManagementRequests]
  );
  const recentApproved = useMemo(
    () => approved.filter((enrollment) => enrollment.batch !== null).slice(0, 4),
    [approved]
  );
  const recentRejected = useMemo(() => rejected.slice(0, 4), [rejected]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [nextActiveBatches, nextPending, nextApproved, nextRejected] =
        await Promise.all([
          getTeacherBatches({ status: "active" }),
          getTeacherEnrollments({ status: "pending" }),
          getTeacherEnrollments({ status: "approved" }),
          getTeacherEnrollments({ status: "rejected" }),
        ]);

      setActiveBatches(nextActiveBatches);
      setPending(nextPending);
      setApproved(nextApproved);
      setRejected(nextRejected);
      const activeBatchIds = new Set(nextActiveBatches.map((batch) => String(batch.id)));
      const nextUnassignedApproved = nextApproved.filter((enrollment) => enrollment.batch === null);
      const enrollmentsNeedingDrafts = isAdmin
        ? [...nextPending, ...nextUnassignedApproved]
        : nextUnassignedApproved;

      setDrafts((previous) => {
        const next: Record<number, ReviewDraft> = {};
        const fallbackDraft = defaultDraft(nextActiveBatches);

        for (const item of enrollmentsNeedingDrafts) {
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load enrollments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [isAdmin]);

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

  async function handleApprove(enrollmentId: number) {
    if (!isAdmin) {
      setError("Only admin accounts can approve student applications.");
      return;
    }
    const draft = drafts[enrollmentId] ?? defaultDraft(activeBatches);
    setBusyId(enrollmentId);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      const approval = await approveTeacherEnrollment(enrollmentId, {
        batch_id: draft.batchId ? Number(draft.batchId) : null,
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
    if (!isAdmin) {
      setError("Only admin accounts can reject student applications.");
      return;
    }
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

  function managementBatchOptions(enrollment: TeacherEnrollment): TeacherBatch[] {
    const requestedTeacherId = enrollment.requested_teacher?.id;
    if (!requestedTeacherId) {
      return activeBatches;
    }
    return activeBatches.filter(
      (batch) =>
        batch.primary_teacher === null || batch.primary_teacher.id === requestedTeacherId
    );
  }

  async function handleAssignToBatch(enrollmentId: number) {
    const draft = drafts[enrollmentId] ?? defaultDraft(activeBatches);
    if (!draft.batchId) {
      setError("Select an active batch before assigning this student.");
      return;
    }

    setBusyId(enrollmentId);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      await assignTeacherEnrollmentBatch(enrollmentId, {
        batch_id: Number(draft.batchId),
        notes: draft.internalNote.trim() || null,
      });
      setMessage("Student assigned to the selected batch successfully.");
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to assign student to batch.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestManagement(enrollmentId: number) {
    if (isAdmin) {
      setError("Admin accounts cannot submit teacher management requests.");
      return;
    }
    const draft = drafts[enrollmentId] ?? defaultDraft(activeBatches);
    setBusyId(enrollmentId);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      const response = await requestTeacherEnrollmentManagement(enrollmentId, {
        note: draft.internalNote.trim() || null,
      });
      setMessageTone("warning");
      setMessage(
        response.teacher_assignment_request_status === "pending"
          ? "Request sent to admin. The student will stay unbatched until admin reviews your request."
          : "Management request saved."
      );
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to submit management request."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveManagementRequest(enrollment: TeacherEnrollment) {
    if (!isAdmin) {
      setError("Only admin accounts can approve management requests.");
      return;
    }
    const draft = drafts[enrollment.id] ?? defaultDraft(activeBatches);
    if (!draft.batchId) {
      setError("Select an active batch before approving this teacher request.");
      return;
    }

    setBusyId(enrollment.id);
    setError(null);
    setMessage(null);
    setMessageTone("success");
    setApprovalResult(null);
    try {
      await approveTeacherEnrollmentManagementRequest(enrollment.id, {
        batch_id: Number(draft.batchId),
        decision_note: draft.internalNote.trim() || null,
      });
      setMessage("Teacher request approved and student assigned to the selected batch.");
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to approve teacher request."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectManagementRequest(enrollmentId: number) {
    if (!isAdmin) {
      setError("Only admin accounts can reject management requests.");
      return;
    }
    const draft = drafts[enrollmentId] ?? defaultDraft(activeBatches);
    setBusyId(enrollmentId);
    setError(null);
    setMessage(null);
    setMessageTone("warning");
    setApprovalResult(null);
    try {
      await rejectTeacherEnrollmentManagementRequest(enrollmentId, {
        decision_note: draft.internalNote.trim() || null,
      });
      setMessage("Teacher management request rejected.");
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to reject teacher request."
      );
    } finally {
      setBusyId(null);
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
            {isAdmin
              ? "Approve student applications and finalize enrollment decisions."
              : "Assign approved students without a batch into your active classes."}
          </h2>
          <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
            {isAdmin
              ? "Review payment proofs, approve or reject registrants, then pass approved learners into the right batch-teacher setup."
              : "When admin approves students without a batch, use this queue to enroll them into your active batches."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            {isAdmin ? "Pending Student Applications" : "My Requests"}
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {isAdmin ? pending.length : myPendingManagementRequests.length}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            {isAdmin
              ? "Count of student applications waiting for admin approval."
              : "Your pending requests to admin for teacher management."}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            {isAdmin ? "Students Enrolled" : "Approved"}
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{approved.length}</p>
          <p className="teacher-panel-copy mt-2 text-sm">
            {isAdmin
              ? "Count of students with approved enrollment records."
              : "Students with active enrollment records."}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            {isAdmin ? "Enrolled, No Teacher Assigned" : "Approved, No Batch"}
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {isAdmin ? enrolledWithoutTeacher.length : unassignedApproved.length}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            {isAdmin
              ? "Enrolled students with no teacher assignment yet."
              : "Approved students still waiting for batch assignment."}
          </p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            {isAdmin ? "Active Batch Counts" : "Batches"}
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{activeBatches.length}</p>
          <p className="teacher-panel-copy mt-2 text-sm">
            {isAdmin
              ? "Count of active batches currently available."
              : "Active batches ready for assignment."}
          </p>
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

      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
          {isAdmin ? "Pending Queue" : "Unbatched Approved Students"}
        </p>
        <div className="mt-4 space-y-4">
          {isAdmin ? (
            pending.length ? (
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
                        <option value="">Approve without assigning batch</option>
                        {activeBatches.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {batch.name} ({batch.code})
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="teacher-card-control min-h-24"
                        placeholder="Internal admin note for approval or rejection (not emailed)"
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
                        disabled={busy}
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
            )
          ) : unassignedApproved.length ? (
            unassignedApproved.map((enrollment) => {
              const draft = drafts[enrollment.id] ?? defaultDraft(activeBatches);
              const busy = busyId === enrollment.id;
              const requestOwnedByCurrentTeacher =
                enrollment.requested_teacher?.id === currentUserId;
              const requestPendingByOtherTeacher =
                enrollment.teacher_assignment_request_status === "pending" &&
                enrollment.requested_teacher !== null &&
                !requestOwnedByCurrentTeacher;
              const managementRequestLabel = requestPendingByOtherTeacher
                ? `Requested by ${enrollment.requested_teacher?.full_name ?? "another teacher"}`
                : enrollment.teacher_assignment_request_status === "pending" &&
                    requestOwnedByCurrentTeacher
                  ? "Update Request"
                  : "Request Admin Assignment";

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
                      Awaiting batch
                    </span>
                  </div>
                  <p className="teacher-card-meta mt-3 text-xs">
                    Approved {formatDateTime(enrollment.approved_at)} by admin
                  </p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Request status:{" "}
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${requestStatusTone(
                        enrollment.teacher_assignment_request_status
                      )}`}
                    >
                      {requestStatusLabel(enrollment.teacher_assignment_request_status)}
                    </span>
                  </p>
                  {enrollment.requested_teacher ? (
                    <p className="teacher-card-meta mt-2 text-xs">
                      Requested teacher: {enrollment.requested_teacher.full_name}
                    </p>
                  ) : null}
                  {enrollment.teacher_assignment_request_note?.trim() ? (
                    <p className="teacher-card-copy mt-2 text-sm">
                      Request note: {enrollment.teacher_assignment_request_note.trim()}
                    </p>
                  ) : null}
                  {enrollment.teacher_assignment_decision_note?.trim() ? (
                    <p className="teacher-card-copy mt-2 text-sm">
                      Admin decision note: {enrollment.teacher_assignment_decision_note.trim()}
                    </p>
                  ) : null}
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
                      placeholder="Optional enrollment note while assigning batch"
                      value={draft.internalNote}
                      onChange={(event) => handleInternalNoteChange(enrollment.id, event.target.value)}
                    />
                  </div>
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
                      className="teacher-card-ghost-button rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
                      disabled={busy || requestPendingByOtherTeacher}
                      onClick={() => void handleRequestManagement(enrollment.id)}
                      type="button"
                    >
                      {busy ? "Saving..." : managementRequestLabel}
                    </button>
                    <button
                      className="rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:opacity-60"
                      disabled={busy || !activeBatches.length}
                      onClick={() => void handleAssignToBatch(enrollment.id)}
                      type="button"
                    >
                      {busy ? "Saving..." : "Assign to Batch"}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
              No approved students are waiting for batch assignment.
            </div>
          )}
        </div>
      </div>

      {isAdmin ? (
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Teacher Management Requests
          </p>
          <div className="mt-4 space-y-4">
            {pendingManagementRequests.length ? (
              pendingManagementRequests.map((enrollment) => {
                const draft = drafts[enrollment.id] ?? defaultDraft(activeBatches);
                const busy = busyId === enrollment.id;
                const eligibleBatches = managementBatchOptions(enrollment);

                return (
                  <article
                    key={enrollment.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="teacher-card-title text-lg font-black">{fullName(enrollment)}</p>
                        <p className="teacher-card-copy mt-1 text-sm">
                          Requested by{" "}
                          <span className="font-semibold">
                            {enrollment.requested_teacher?.full_name ?? "Unknown teacher"}
                          </span>
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${requestStatusTone(
                          enrollment.teacher_assignment_request_status
                        )}`}
                      >
                        {requestStatusLabel(enrollment.teacher_assignment_request_status)}
                      </span>
                    </div>
                    <p className="teacher-card-meta mt-3 text-xs">
                      Requested {formatDateTime(enrollment.teacher_assignment_requested_at)}
                    </p>
                    {enrollment.teacher_assignment_request_note?.trim() ? (
                      <p className="teacher-card-copy mt-2 text-sm">
                        Teacher note: {enrollment.teacher_assignment_request_note.trim()}
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <select
                        className="teacher-card-control"
                        value={draft.batchId}
                        onChange={(event) =>
                          updateDraft(enrollment.id, "batchId", event.target.value)
                        }
                      >
                        <option value="">Select teacher-owned batch</option>
                        {eligibleBatches.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {batch.name} ({batch.code})
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="teacher-card-control min-h-24"
                        placeholder="Optional admin decision note"
                        value={draft.internalNote}
                        onChange={(event) => handleInternalNoteChange(enrollment.id, event.target.value)}
                      />
                    </div>
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
                        disabled={busy || !eligibleBatches.length || !draft.batchId}
                        onClick={() => void handleApproveManagementRequest(enrollment)}
                        type="button"
                      >
                        {busy ? "Saving..." : "Approve Request"}
                      </button>
                      <button
                        className="rounded-xl bg-brandRed px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandRed/90 disabled:opacity-60"
                        disabled={busy}
                        onClick={() => void handleRejectManagementRequest(enrollment.id)}
                        type="button"
                      >
                        {busy ? "Saving..." : "Reject Request"}
                      </button>
                    </div>
                    {!eligibleBatches.length ? (
                      <p className="teacher-card-meta mt-3 text-xs">
                        No active batch is assigned to{" "}
                        {enrollment.requested_teacher?.full_name ?? "the requested teacher"} yet.
                        Assign a batch teacher first in Class Management.
                      </p>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No pending teacher management requests.
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className={`grid gap-4 ${isAdmin ? "xl:grid-cols-2" : ""}`}>
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

        {isAdmin ? (
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
        ) : null}
      </div>

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}

export default EnrollmentManagementWorkspace;
