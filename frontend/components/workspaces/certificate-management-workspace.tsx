"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-context";
import { TeacherCertificateHistoryItem, getTeacherCertificateHistory } from "@/lib/api";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not issued";
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

function formatStatusLabel(row: TeacherCertificateHistoryItem) {
  if (row.issued_at) {
    return "Issued";
  }
  return row.status === "approved" ? "Approved" : "Rejected";
}

function statusTone(row: TeacherCertificateHistoryItem) {
  if (row.issued_at) {
    return "border-brandGreen/30 bg-brandGreenLight text-brandGreen";
  }
  if (row.status === "approved") {
    return "border-brandBlue/30 bg-brandBlueLight text-brandBlue";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

export function CertificateManagementWorkspace() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<TeacherCertificateHistoryItem[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setLoading(true);
        setPageError(null);
        const nextRows = await getTeacherCertificateHistory({
          status: showAllDecisions ? "all" : "issued",
        });
        if (!isActive) {
          return;
        }
        setRows(nextRows);
      } catch (requestError) {
        if (!isActive) {
          return;
        }
        setPageError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load certificate management records."
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
  }, [showAllDecisions]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();
    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) =>
      [
        row.student.full_name,
        row.student.username,
        row.student.email ?? "",
        row.batch?.name ?? "",
        row.batch?.code ?? "",
        row.certificate_reference,
        row.decided_by_name,
        row.decision_note ?? "",
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [rows, searchValue]);

  const issuedCount = useMemo(
    () => rows.filter((row) => Boolean(row.issued_at)).length,
    [rows]
  );
  const uniqueStudentCount = useMemo(
    () => new Set(rows.map((row) => row.student.id)).size,
    [rows]
  );
  const advisoryBatchCount = useMemo(
    () =>
      new Set(
        rows
          .map((row) => row.batch?.id)
          .filter((value): value is number => typeof value === "number")
      ).size,
    [rows]
  );

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Certificate Management
          </p>
          <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
            {isAdmin
              ? "Review certificate decisions across teacher-managed students and advisory batches."
              : "Review issued certificate records and trace them back to the students and batches you currently manage."}
          </h2>
          <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
            {isAdmin
              ? "This ledger centralizes certificate review decisions. Use it to verify issuance outcomes and open student records for follow-up."
              : "This ledger shows teacher-reviewed certificate records. The batch column reflects the student&apos;s current advisory batch based on the latest approved enrollment so you can quickly open the right learner record and certificate preview."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Issued Certificates
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : issuedCount}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            {isAdmin
              ? "Certificate records issued across the admin workspace."
              : "Teacher-issued certificate records currently visible in this ledger."}
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Students Covered
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : uniqueStudentCount}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            {isAdmin
              ? "Learners represented across all accessible certificate decisions."
              : "Learners with certificate decisions available to your teacher scope."}
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Advisory Batches
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {loading ? "..." : advisoryBatchCount}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            {isAdmin
              ? "Advisory batches represented in this certificate view."
              : "Current batches represented by the students in this certificate view."}
          </p>
        </div>
      </div>

      <div className="panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Certificate Ledger
            </p>
            <h3 className="teacher-panel-heading mt-2 text-2xl font-black">
              Student and batch certificate records
            </h3>
            <p className="teacher-panel-copy mt-2 text-sm">
              {isAdmin
                ? "Search by student, advisory batch, certificate reference, reviewer, or note. Keep issued-only mode, or include all decisions."
                : "Search by student, advisory batch, certificate reference, teacher, or note. Keep the default view for issued certificates only, or expand it to see rejected reviews too."}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandBlue">
                Search
              </span>
              <input
                className="teacher-card-control min-w-[280px]"
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Student, batch, certificate ref..."
                value={searchValue}
              />
            </label>

            <label className="teacher-card-copy flex items-center gap-2 pb-1 text-sm font-semibold">
              <input
                checked={showAllDecisions}
                onChange={(event) => setShowAllDecisions(event.target.checked)}
                type="checkbox"
              />
              Show all decisions
            </label>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-5 text-sm text-slate-700">
            Loading certificate management records...
          </div>
        ) : pageError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
            Error: {pageError}
          </div>
        ) : filteredRows.length ? (
          <div className="overflow-hidden rounded-3xl border border-black/10 bg-black/5">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-black/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                      Student
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-accentWarm">
                      Current Advisory Batch
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                      Certificate
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                      Teacher Review
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                      Note
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-4 align-top">
                        <p className="teacher-card-title text-sm font-black">{row.student.full_name}</p>
                        <p className="teacher-card-meta mt-1 text-xs">
                          {row.student.email ?? row.student.username}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        {row.batch ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="teacher-card-title text-sm font-black">{row.batch.name}</p>
                              {row.batch.status === "archived" ? (
                                <span className="rounded-full border border-black/10 bg-brandYellowLight px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brandNavy">
                                  Archived
                                </span>
                              ) : null}
                            </div>
                            <p className="teacher-card-meta mt-1 text-xs uppercase tracking-[0.2em]">
                              {row.batch.code}
                            </p>
                          </>
                        ) : (
                          <p className="teacher-card-copy text-sm">No current advisory batch</p>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="teacher-card-title text-sm font-black">
                          {row.certificate_reference}
                        </p>
                        <p className="teacher-card-meta mt-1 text-xs">
                          Issued {formatDateTime(row.issued_at)}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusTone(
                            row
                          )}`}
                        >
                          {formatStatusLabel(row)}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="teacher-card-title text-sm font-black">{row.decided_by_name}</p>
                        <p className="teacher-card-meta mt-1 text-xs">
                          Reviewed {formatDateTime(row.decided_at)}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="max-w-xs text-sm text-slate-700">
                          {row.decision_note?.trim() || "No teacher note saved."}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            className="rounded-xl bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
                            href={`/teacher/students/${row.student.id}`}
                          >
                            Open Student
                          </Link>
                          <Link
                            className="teacher-card-ghost-button rounded-xl border px-3 py-2 text-xs font-semibold transition"
                            href={`/teacher/students/${row.student.id}/certificate`}
                          >
                            Preview
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : rows.length ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-black/5 px-4 py-5 text-sm text-slate-700">
            No certificate records matched your search. Try a student name, batch code, or
            certificate reference.
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-black/15 bg-black/5 px-4 py-5 text-sm text-slate-700">
            No certificate records are available yet. Once certificates are approved and issued,
            they will appear here with the student and current advisory batch.
          </div>
        )}
      </div>
    </section>
  );
}

export default CertificateManagementWorkspace;
