"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  TeacherCertificateHistoryItem,
  TeacherEnrollment,
  getTeacherCertificateHistory,
  getTeacherEnrollments,
} from "@/lib/api";

type EnrollmentPreviewItem =
  | { kind: "pending"; enrollment: TeacherEnrollment }
  | { kind: "unbatched"; enrollment: TeacherEnrollment };

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
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

function fullName(enrollment: TeacherEnrollment) {
  if (enrollment.student?.full_name) {
    return enrollment.student.full_name;
  }
  const registration = enrollment.registration;
  return [registration.first_name, registration.middle_name, registration.last_name]
    .filter(Boolean)
    .join(" ");
}

function certificateStatus(row: TeacherCertificateHistoryItem) {
  if (row.issued_at) {
    return "Issued";
  }
  return row.status === "approved" ? "Approved" : "Rejected";
}

export function AdminHome() {
  const [pendingEnrollments, setPendingEnrollments] = useState<TeacherEnrollment[]>([]);
  const [approvedEnrollments, setApprovedEnrollments] = useState<TeacherEnrollment[]>([]);
  const [certificateRows, setCertificateRows] = useState<TeacherCertificateHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setLoading(true);
        setPageError(null);
        const [nextPending, nextApproved, nextCertificates] = await Promise.all([
          getTeacherEnrollments({ status: "pending" }),
          getTeacherEnrollments({ status: "approved" }),
          getTeacherCertificateHistory({ status: "all" }),
        ]);

        if (!isActive) {
          return;
        }

        setPendingEnrollments(nextPending);
        setApprovedEnrollments(nextApproved);
        setCertificateRows(nextCertificates);
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setPageError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load admin dashboard data."
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
  }, []);

  const approvedWithoutBatch = useMemo(
    () => approvedEnrollments.filter((enrollment) => enrollment.batch === null),
    [approvedEnrollments]
  );
  const pendingTeacherRequests = useMemo(
    () =>
      approvedWithoutBatch.filter(
        (enrollment) => enrollment.teacher_assignment_request_status === "pending"
      ),
    [approvedWithoutBatch]
  );
  const issuedCertificates = useMemo(
    () => certificateRows.filter((row) => Boolean(row.issued_at)),
    [certificateRows]
  );
  const enrollmentPreview = useMemo<EnrollmentPreviewItem[]>(
    () => [
      ...pendingEnrollments.map((enrollment) => ({ kind: "pending" as const, enrollment })),
      ...approvedWithoutBatch.map((enrollment) => ({ kind: "unbatched" as const, enrollment })),
    ].slice(0, 5),
    [pendingEnrollments, approvedWithoutBatch]
  );
  const certificatePreview = useMemo(
    () => certificateRows.slice(0, 5),
    [certificateRows]
  );

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Admin Workspace
          </p>
          <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
            Monitor enrollment decisions and certificate outcomes from one dashboard.
          </h2>
          <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
            This admin dashboard is focused on enrollment and certification operations. Use the
            previews below to jump directly into action queues.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Pending Applications
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : pendingEnrollments.length}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Registrations waiting for admin review.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Approved, No Batch
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : approvedWithoutBatch.length}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Approved students still waiting for batch assignment.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Pending Teacher Requests
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : pendingTeacherRequests.length}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Teacher management requests needing admin decision.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Issued Certificates
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : issuedCertificates.length}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Certificate records with issued timestamps.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                Enrollment Preview
              </p>
              <p className="teacher-card-meta mt-2 text-xs">
                Pending applications and unbatched approved students.
              </p>
            </div>
            <Link
              className="rounded-xl bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              href="/admin/enrollment"
            >
              Open Enrollment
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                Loading enrollment preview...
              </div>
            ) : enrollmentPreview.length ? (
              enrollmentPreview.map((entry) => (
                <article
                  key={`${entry.kind}-${entry.enrollment.id}`}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="teacher-card-title text-sm font-black">
                      {fullName(entry.enrollment)}
                    </p>
                    <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-800">
                      {entry.kind === "pending"
                        ? "Pending application"
                        : entry.enrollment.teacher_assignment_request_status === "pending"
                          ? "Unbatched · request pending"
                          : "Unbatched approved"}
                    </span>
                  </div>
                  <p className="teacher-card-meta mt-2 text-xs">
                    {entry.enrollment.registration.email}
                  </p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Submitted {formatDateTime(entry.enrollment.created_at)}
                  </p>
                </article>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No enrollment items are waiting right now.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
                Certificate Preview
              </p>
              <p className="teacher-card-meta mt-2 text-xs">
                Latest certificate decisions and issuance history.
              </p>
            </div>
            <Link
              className="rounded-xl bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              href="/admin/certificate-management"
            >
              Open Certificates
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                Loading certificate preview...
              </div>
            ) : certificatePreview.length ? (
              certificatePreview.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="teacher-card-title text-sm font-black">
                      {row.student.full_name}
                    </p>
                    <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-800">
                      {certificateStatus(row)}
                    </span>
                  </div>
                  <p className="teacher-card-meta mt-2 text-xs">{row.certificate_reference}</p>
                  <p className="teacher-card-meta mt-2 text-xs">
                    Reviewed {formatDateTime(row.decided_at)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      className="rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
                      href={`/teacher/students/${row.student.id}`}
                    >
                      Open Student
                    </Link>
                    <Link
                      className="teacher-card-ghost-button rounded-lg border px-3 py-2 text-xs font-semibold transition"
                      href={`/teacher/students/${row.student.id}/certificate`}
                    >
                      Preview
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No certificate records are available yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {pageError ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {pageError}</p>
        </div>
      ) : null}
    </section>
  );
}

export default AdminHome;
