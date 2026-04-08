"use client";

import { useEffect, useMemo, useState } from "react";

import {
  RegistrationRecord,
  TeacherBatch,
  approveTeacherRegistration,
  getTeacherBatches,
  getTeacherRegistrations,
  rejectTeacherRegistration,
  resendTeacherRegistrationCredentials,
  updateTeacherBatch,
} from "@/lib/api";
import { getUploadBase } from "@/lib/api-base";

type ApprovalDraft = {
  issuedUsername: string;
  batchName: string;
  currentWeekNumber: number;
  notes: string;
};

function toDefaultUsername(registration: RegistrationRecord) {
  const base = [registration.first_name, registration.last_name]
    .filter(Boolean)
    .join(".")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "");
  return base || `student${registration.id}`;
}

function makeApprovalDraft(
  registration: RegistrationRecord,
  batches: TeacherBatch[]
): ApprovalDraft {
  const fallbackBatch = batches[0];
  return {
    issuedUsername: registration.issued_username ?? toDefaultUsername(registration),
    batchName: registration.requested_batch_name ?? fallbackBatch?.name ?? "Section A",
    currentWeekNumber: fallbackBatch?.current_week_number ?? 1,
    notes: registration.notes ?? "",
  };
}

function registrationFullName(registration: RegistrationRecord) {
  return [registration.first_name, registration.middle_name, registration.last_name]
    .filter(Boolean)
    .join(" ");
}

export default function TeacherClassesPage() {
  const [batches, setBatches] = useState<TeacherBatch[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [approvalDrafts, setApprovalDrafts] = useState<Record<number, ApprovalDraft>>({});
  const [rejectNotes, setRejectNotes] = useState<Record<number, string>>({});
  const [batchWeekDrafts, setBatchWeekDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadPageData() {
    setLoading(true);
    setError(null);
    try {
      const [batchData, registrationData] = await Promise.all([
        getTeacherBatches(),
        getTeacherRegistrations(),
      ]);
      setBatches(batchData);
      setRegistrations(registrationData);
      setApprovalDrafts((previous) => {
        const next = { ...previous };
        for (const registration of registrationData) {
          if (!next[registration.id]) {
            next[registration.id] = makeApprovalDraft(registration, batchData);
          }
        }
        return next;
      });
      setBatchWeekDrafts(
        Object.fromEntries(
          batchData.map((batch) => [batch.id, String(batch.current_week_number)])
        )
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load classes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  const pendingRegistrations = useMemo(
    () => registrations.filter((registration) => registration.status === "pending"),
    [registrations]
  );
  const approvedRegistrations = useMemo(
    () => registrations.filter((registration) => registration.status === "approved"),
    [registrations]
  );
  const rejectedRegistrations = useMemo(
    () => registrations.filter((registration) => registration.status === "rejected"),
    [registrations]
  );
  const totalStudents = useMemo(
    () => batches.reduce((total, batch) => total + batch.student_count, 0),
    [batches]
  );

  function setApprovalField(
    registrationId: number,
    field: keyof ApprovalDraft,
    value: string | number
  ) {
    setApprovalDrafts((previous) => ({
      ...previous,
      [registrationId]: {
        ...previous[registrationId],
        [field]: value,
      },
    }));
  }

  async function handleApprove(registration: RegistrationRecord) {
    const draft = approvalDrafts[registration.id] ?? makeApprovalDraft(registration, batches);
    setBusyKey(`approve-${registration.id}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await approveTeacherRegistration(registration.id, {
        issued_username: draft.issuedUsername.trim(),
        batch_name: draft.batchName.trim(),
        current_week_number: Number(draft.currentWeekNumber) || 1,
        notes: draft.notes.trim() || undefined,
      });
      setSuccess(response.message);
      await loadPageData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Approval failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReject(registrationId: number) {
    setBusyKey(`reject-${registrationId}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await rejectTeacherRegistration(registrationId, {
        notes: rejectNotes[registrationId]?.trim() || undefined,
      });
      setSuccess(response.message);
      await loadPageData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Reject failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleResend(registrationId: number) {
    setBusyKey(`resend-${registrationId}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await resendTeacherRegistrationCredentials(registrationId);
      setSuccess(response.message);
      await loadPageData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Resend failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBatchWeekSave(batchId: number) {
    const nextValue = Number(batchWeekDrafts[batchId]);
    if (!Number.isFinite(nextValue) || nextValue < 1) {
      setError("Week number must be at least 1.");
      return;
    }

    setBusyKey(`batch-${batchId}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateTeacherBatch(batchId, nextValue);
      setSuccess(`Updated ${response.name} to week ${response.current_week_number}.`);
      await loadPageData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Batch update failed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
          Class Overview
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">
          Manage batches, review enrollees, and approve student access in one teacher workflow.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          Phase 2 turns the class workspace into a real operational view: approved students are
          grouped into batches with editable week tracking, while pending registrations stay in the
          same page for fast approval and credential delivery.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Batches
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">{batches.length}</p>
          <p className="mt-2 text-sm text-slate-300">Active groups ready for weekly tracking.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Enrolled Students
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">{totalStudents}</p>
          <p className="mt-2 text-sm text-slate-300">Approved student accounts linked to batches.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Pending Queue
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">{pendingRegistrations.length}</p>
          <p className="mt-2 text-sm text-slate-300">Waiting for teacher review and approval.</p>
        </div>
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Credential Deliveries
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">{approvedRegistrations.length}</p>
          <p className="mt-2 text-sm text-slate-300">
            Approved accounts with teacher-triggered credential delivery.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="text-sm text-slate-300">Loading class management data...</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Batch Access
          </p>
          <div className="mt-4 space-y-4">
            {batches.length > 0 ? (
              batches.map((batch) => (
                <div key={batch.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-black text-brandWhite">{batch.name}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {batch.student_count} student{batch.student_count === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="flex items-end gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                        Week
                        <input
                          className="mt-2 w-24 rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                          min={1}
                          onChange={(event) =>
                            setBatchWeekDrafts((previous) => ({
                              ...previous,
                              [batch.id]: event.target.value,
                            }))
                          }
                          type="number"
                          value={batchWeekDrafts[batch.id] ?? String(batch.current_week_number)}
                        />
                      </label>
                      <button
                        className="rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busyKey === `batch-${batch.id}`}
                        onClick={() => void handleBatchWeekSave(batch.id)}
                        type="button"
                      >
                        {busyKey === `batch-${batch.id}` ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {batch.students.length > 0 ? (
                      batch.students.map((student) => (
                        <div
                          key={student.user_id}
                          className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                        >
                          <p className="text-sm font-semibold text-brandWhite">
                            {student.full_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            {student.username}
                            {student.email ? ` • ${student.email}` : ""}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-slate-300">
                        No students assigned yet.
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                No batches found yet. Approving a student with a batch name will create the batch
                automatically.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Pending Registration Queue
            </p>
            <div className="mt-4 space-y-4">
              {pendingRegistrations.length > 0 ? (
                pendingRegistrations.map((registration) => {
                  const draft =
                    approvalDrafts[registration.id] ?? makeApprovalDraft(registration, batches);
                  return (
                    <div
                      key={registration.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-black text-brandWhite">
                            {registrationFullName(registration)}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">{registration.email}</p>
                          <p className="mt-1 text-xs text-slate-300">
                            {registration.phone_number} • Ref #{registration.reference_number}
                          </p>
                          {registration.requested_batch_name ? (
                            <p className="mt-1 text-xs text-slate-300">
                              Requested batch: {registration.requested_batch_name}
                            </p>
                          ) : null}
                        </div>

                        {registration.reference_image_path ? (
                          <a
                            className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-brandWhite transition hover:bg-white/10"
                            href={`${getUploadBase()}/${registration.reference_image_path}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            View Payment Proof
                          </a>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-200">
                          Username
                          <input
                            className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                            onChange={(event) =>
                              setApprovalField(registration.id, "issuedUsername", event.target.value)
                            }
                            type="text"
                            value={draft.issuedUsername}
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-200">
                          Batch / Section
                          <input
                            className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                            onChange={(event) =>
                              setApprovalField(registration.id, "batchName", event.target.value)
                            }
                            type="text"
                            value={draft.batchName}
                          />
                        </label>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-[140px,1fr]">
                        <label className="text-sm font-semibold text-slate-200">
                          Current Week
                          <input
                            className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                            min={1}
                            onChange={(event) =>
                              setApprovalField(
                                registration.id,
                                "currentWeekNumber",
                                Number(event.target.value)
                              )
                            }
                            type="number"
                            value={draft.currentWeekNumber}
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-200">
                          Teacher Notes
                          <input
                            className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                            onChange={(event) =>
                              setApprovalField(registration.id, "notes", event.target.value)
                            }
                            type="text"
                            value={draft.notes}
                          />
                        </label>
                      </div>

                      <label className="mt-3 block text-sm font-semibold text-slate-200">
                        Reject Note
                        <input
                          className="mt-2 w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                          onChange={(event) =>
                            setRejectNotes((previous) => ({
                              ...previous,
                              [registration.id]: event.target.value,
                            }))
                          }
                          type="text"
                          value={rejectNotes[registration.id] ?? ""}
                        />
                      </label>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          className="rounded-lg bg-brandGreen px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandGreen/90 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={busyKey === `approve-${registration.id}`}
                          onClick={() => void handleApprove(registration)}
                          type="button"
                        >
                          {busyKey === `approve-${registration.id}` ? "Approving..." : "Approve"}
                        </button>
                        <button
                          className="rounded-lg bg-brandRed px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={busyKey === `reject-${registration.id}`}
                          onClick={() => void handleReject(registration.id)}
                          type="button"
                        >
                          {busyKey === `reject-${registration.id}` ? "Rejecting..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  No pending registrations right now.
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
              Recent Credential Actions
            </p>
            <div className="mt-4 space-y-3">
              {approvedRegistrations.slice(0, 6).map((registration) => (
                <div
                  key={registration.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-brandWhite">
                        {registrationFullName(registration)}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {registration.issued_username ?? "No username"}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        Email status: {registration.credential_email_status ?? "pending"}
                      </p>
                    </div>

                    <button
                      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-brandWhite transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={busyKey === `resend-${registration.id}`}
                      onClick={() => void handleResend(registration.id)}
                      type="button"
                    >
                      {busyKey === `resend-${registration.id}` ? "Sending..." : "Resend Credentials"}
                    </button>
                  </div>
                </div>
              ))}

              {approvedRegistrations.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  No approved registrations yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
              Rejected Items
            </p>
            <div className="mt-4 space-y-3">
              {rejectedRegistrations.slice(0, 4).map((registration) => (
                <div
                  key={registration.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="text-sm font-black text-brandWhite">
                    {registrationFullName(registration)}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {registration.notes || "No rejection note recorded."}
                  </p>
                </div>
              ))}

              {rejectedRegistrations.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  No rejected registrations yet.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {success ? (
        <div className="rounded-lg border border-brandGreen/30 bg-brandGreenLight px-4 py-3 text-sm text-slate-800">
          {success}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </div>
      ) : null}
    </section>
  );
}
