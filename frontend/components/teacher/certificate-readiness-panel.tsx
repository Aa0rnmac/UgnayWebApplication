"use client";

import Link from "next/link";
import { useState } from "react";

import {
  TeacherStudentCertificate,
  decideTeacherStudentCertificate,
} from "@/lib/api";

type TeacherCertificateReadinessPanelProps = {
  certificate: TeacherStudentCertificate | null;
  error: string | null;
  loading: boolean;
  onChange: (nextCertificate: TeacherStudentCertificate) => void;
  studentId: number;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not decided yet";
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return "No data";
  return `${value.toFixed(digits)}%`;
}

function decisionTone(status: "approved" | "rejected" | "pending") {
  if (status === "approved") {
    return "border-brandGreen/35 bg-brandGreenLight text-slate-900";
  }
  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-brandBlue/20 bg-brandBlueLight text-slate-900";
}

export function TeacherCertificateReadinessPanel({
  certificate,
  error,
  loading,
  onChange,
  studentId,
}: TeacherCertificateReadinessPanelProps) {
  const [note, setNote] = useState("");
  const [decisionLoading, setDecisionLoading] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function submitDecision(decision: "approve" | "reject") {
    setDecisionLoading(decision);
    setActionError(null);
    setActionMessage(null);
    try {
      const nextCertificate = await decideTeacherStudentCertificate(studentId, {
        decision,
        note: note.trim() || null,
      });
      onChange(nextCertificate);
      setActionMessage(
        decision === "approve"
          ? "Certificate approved and generated for this student."
          : "Certificate generation was rejected for now. The student can still be reviewed again later."
      );
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the certificate decision."
      );
    } finally {
      setDecisionLoading(null);
    }
  }

  return (
    <section className="panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Certificate Readiness
          </p>
          <h3 className="teacher-panel-heading mt-2 text-2xl font-black leading-tight">
            Module completion and score review
          </h3>
          <p className="teacher-panel-copy mt-2 max-w-3xl text-sm">
            Track the student&apos;s required modules, review the best score saved per module, and
            decide whether the certificate can be generated.
          </p>
        </div>

        {certificate?.template ? (
          <Link
            className="rounded-full border border-brandBlue bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
            href={`/teacher/students/${studentId}/certificate`}
          >
            Preview Certificate
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-5">
          <p className="teacher-card-copy text-sm">Loading certificate readiness...</p>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
          Error: {error}
        </div>
      ) : null}

      {!loading && !error && certificate ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                Target
              </p>
              <p className="teacher-panel-value mt-3 text-3xl font-black">
                {certificate.summary.target_required_modules}
              </p>
              <p className="teacher-card-meta mt-2 text-xs">Planned full curriculum modules.</p>
            </div>
            <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
                Effective Now
              </p>
              <p className="teacher-panel-value mt-3 text-3xl font-black">
                {certificate.summary.effective_required_modules}
              </p>
              <p className="teacher-card-meta mt-2 text-xs">Currently student-visible modules.</p>
            </div>
            <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
                Completed
              </p>
              <p className="teacher-panel-value mt-3 text-3xl font-black">
                {certificate.summary.completed_required_modules}
              </p>
              <p className="teacher-card-meta mt-2 text-xs">Required modules fully completed.</p>
            </div>
            <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
                Average Best
              </p>
              <p className="teacher-panel-value mt-3 text-3xl font-black">
                {formatPercent(certificate.summary.average_best_score)}
              </p>
              <p className="teacher-card-meta mt-2 text-xs">Passing average is 65%.</p>
            </div>
            <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                Decision
              </p>
              <div
                className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  certificate.record
                    ? decisionTone(certificate.record.status)
                    : decisionTone("pending")
                }`}
              >
                {certificate.record?.status ?? "pending"}
              </div>
              <p className="teacher-card-meta mt-2 text-xs">
                {certificate.record
                  ? `Last reviewed ${formatDateTime(certificate.record.decided_at)}`
                  : "Teacher review has not been recorded yet."}
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
                  Eligibility
                </p>
                <p className="teacher-card-copy mt-2 text-sm">{certificate.summary.reason}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  certificate.summary.eligible
                    ? "border-brandGreen/35 bg-brandGreenLight text-slate-900"
                    : "border-brandYellow/35 bg-brandYellowLight text-slate-900"
                }`}
              >
                {certificate.summary.eligible ? "Eligible" : "Not Eligible"}
              </span>
            </div>

            {certificate.record ? (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                  <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                    Reviewed By
                  </p>
                  <p className="teacher-card-title mt-2 text-sm font-black">
                    {certificate.record.decided_by_name}
                  </p>
                </div>
                <div className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                  <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                    Reference
                  </p>
                  <p className="teacher-card-title mt-2 text-sm font-black">
                    {certificate.record.certificate_reference}
                  </p>
                </div>
                <div className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                  <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                    Issued
                  </p>
                  <p className="teacher-card-title mt-2 text-sm font-black">
                    {formatDateTime(certificate.record.issued_at)}
                  </p>
                </div>
              </div>
            ) : null}

            {certificate.record?.decision_note ? (
              <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 px-4 py-3">
                <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                  Teacher Note
                </p>
                <p className="teacher-card-copy mt-2 text-sm">{certificate.record.decision_note}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                  Certificate Actions
                </p>
                <p className="teacher-card-meta mt-2 text-sm">
                  Only teachers can preview, approve, or reject certificate generation. Rejection
                  keeps the student reviewable later.
                </p>
              </div>
              {certificate.summary.eligible ? (
                <span className="rounded-full border border-brandGreen/35 bg-brandGreenLight px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900">
                  Ready For Decision
                </span>
              ) : null}
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-sm font-semibold text-slate-900">Teacher note</span>
              <textarea
                className="teacher-card-control min-h-24 w-full resize-y"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note for approval or rejection."
                value={note}
              />
            </label>

            {actionMessage ? (
              <p className="mt-4 rounded-2xl border border-brandGreen/35 bg-brandGreenLight px-4 py-3 text-sm text-slate-900">
                {actionMessage}
              </p>
            ) : null}
            {actionError ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Error: {actionError}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {certificate.template ? (
                <Link
                  className="rounded-full border border-brandBlue bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
                  href={`/teacher/students/${studentId}/certificate`}
                >
                  Preview Certificate
                </Link>
              ) : null}
              <button
                className="rounded-full bg-brandGreen px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandGreen/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!certificate.summary.eligible || decisionLoading !== null}
                onClick={() => {
                  void submitDecision("approve");
                }}
                type="button"
              >
                {decisionLoading === "approve" ? "Approving..." : "Approve & Generate"}
              </button>
              <button
                className="rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!certificate.summary.eligible || decisionLoading !== null}
                onClick={() => {
                  void submitDecision("reject");
                }}
                type="button"
              >
                {decisionLoading === "reject" ? "Rejecting..." : "Reject For Now"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-black/10 bg-black/5">
            <div className="border-b border-black/10 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
                Required Modules
              </p>
              <p className="teacher-card-meta mt-2 text-sm">
                Best score is used for certificate review, while the latest score shows the current
                saved module result.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-black/10 bg-white/70 text-left text-xs uppercase tracking-[0.2em] text-slate-600">
                    <th className="px-4 py-3 font-semibold">Module</th>
                    <th className="px-4 py-3 font-semibold">Completion</th>
                    <th className="px-4 py-3 font-semibold">Latest Score</th>
                    <th className="px-4 py-3 font-semibold">Best Score</th>
                    <th className="px-4 py-3 font-semibold">Certificate Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {certificate.modules.map((module) => (
                    <tr
                      className="border-b border-black/10 last:border-b-0"
                      key={module.module_id}
                    >
                      <td className="px-4 py-3">
                        <p className="teacher-card-title text-sm font-black">
                          Module {module.order_index}
                        </p>
                        <p className="teacher-card-copy mt-1 text-sm">{module.module_title}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                            module.completed
                              ? "border-brandGreen/35 bg-brandGreenLight text-slate-900"
                              : "border-brandYellow/35 bg-brandYellowLight text-slate-900"
                          }`}
                        >
                          {module.completed ? "Completed" : "Incomplete"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatPercent(module.latest_score)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatPercent(module.best_score)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                            module.passed
                              ? "border-brandGreen/35 bg-brandGreenLight text-slate-900"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          {module.passed ? "Pass" : "Review"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
