"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  TeacherStudentCertificate,
  getTeacherStudentCertificate,
} from "@/lib/api";

function formatDate(value: string | null | undefined) {
  if (!value) return "Pending approval";
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "long" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return "No data";
  return `${value.toFixed(digits)}%`;
}

export default function TeacherStudentCertificatePreviewPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = Number(params.studentId);

  const [certificate, setCertificate] = useState<TeacherStudentCertificate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(studentId)) {
      setError("Invalid student id.");
      return;
    }

    setLoading(true);
    setError(null);
    getTeacherStudentCertificate(studentId)
      .then(setCertificate)
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  const template = certificate?.template ?? null;
  const record = certificate?.record ?? null;
  const isApproved = record?.status === "approved";

  return (
    <section className="certificate-print-page space-y-6">
      <div className="panel print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
              Certificate Preview
            </p>
            <h2 className="teacher-panel-heading mt-2 text-3xl font-black">
              Teacher-only printable certificate
            </h2>
            <p className="teacher-panel-copy mt-2 text-sm">
              Review the certificate layout, then use your browser&apos;s print flow to save it as
              PDF or print it directly.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-full border border-brandBorder bg-white px-4 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
              href={`/teacher/students/${studentId}`}
            >
              Back To Student Detail
            </Link>
            <button
              className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              onClick={() => window.print()}
              type="button"
            >
              Print Certificate
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading certificate preview...</p>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}

      {!loading && !error && !template ? (
        <div className="panel">
          <p className="teacher-card-title text-sm font-black">Certificate preview unavailable.</p>
          <p className="teacher-card-copy mt-2 text-sm">
            This student is not currently eligible for certificate preview, or the certificate data
            is still incomplete.
          </p>
        </div>
      ) : null}

      {!loading && !error && template ? (
        <article className="mx-auto max-w-5xl overflow-hidden rounded-[36px] border border-[#d8ccb4] bg-[#fffaf0] p-6 shadow-2xl print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="rounded-[28px] border border-[#d8ccb4] bg-[linear-gradient(145deg,#fffaf0,#f8edd6)] p-8 md:p-12">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.55em] text-[#826033]">
                FSL Learning Hub
              </p>
              <h1 className="mt-4 text-4xl font-black tracking-[0.08em] text-[#3a2d1b] md:text-5xl">
                {template.certificate_title}
              </h1>
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.35em] text-[#826033]">
                {isApproved ? "Official Teacher-Issued Certificate" : "Teacher Preview Draft"}
              </p>
            </div>

            <div className="mt-10 rounded-[28px] border border-[#d8ccb4] bg-white/70 px-6 py-8 text-center">
              <p className="text-sm uppercase tracking-[0.35em] text-[#826033]">
                Presented To
              </p>
              <p className="mt-4 text-3xl font-black tracking-[0.04em] text-[#2b2114] md:text-4xl">
                {template.student_name}
              </p>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-[#4e412d]">
                {template.completion_statement}
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-[#d8ccb4] bg-white/70 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#826033]">
                  Issue Date
                </p>
                <p className="mt-3 text-lg font-black text-[#2b2114]">
                  {formatDate(template.issue_date)}
                </p>
              </div>
              <div className="rounded-[24px] border border-[#d8ccb4] bg-white/70 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#826033]">
                  Certificate Ref
                </p>
                <p className="mt-3 text-lg font-black text-[#2b2114]">
                  {template.certificate_reference}
                </p>
              </div>
              <div className="rounded-[24px] border border-[#d8ccb4] bg-white/70 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#826033]">
                  Average Best Score
                </p>
                <p className="mt-3 text-lg font-black text-[#2b2114]">
                  {formatPercent(template.average_best_score)}
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
              <div className="rounded-[24px] border border-[#d8ccb4] bg-white/70 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#826033]">
                  Completion Summary
                </p>
                <p className="mt-3 text-sm leading-7 text-[#4e412d]">
                  Completed modules: {template.completed_required_modules} of{" "}
                  {template.effective_required_modules}
                </p>
                <p className="mt-1 text-sm leading-7 text-[#4e412d]">
                  Decision status: {record?.status ?? "Preview"}
                </p>
              </div>

              <div className="text-center">
                <div className="mx-auto h-px w-56 bg-[#826033]" />
                <p className="mt-3 text-lg font-black text-[#2b2114]">
                  {template.approving_teacher_name}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#826033]">
                  Approving Teacher
                </p>
              </div>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
