"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  getTeacherReportStudents,
  getTeacherSections,
  getTeacherStudentProgressReport,
  type TeacherSectionSummary,
  type TeacherStudentItemReport,
  type TeacherStudentProgressReport,
  type TeacherStudentReportRow
} from "@/lib/api";

type StudentTableRow = {
  student_id: number;
  student_name: string;
  student_email: string | null;
  section_id: number;
  section_name: string;
  total_assessments: number;
  pending_reports: number;
  generated_reports: number;
  average_score_percent: number;
  latest_activity_at: string | null;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "No activity";
  }
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0%";
  }
  return `${value.toFixed(1)}%`;
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0s";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function displayStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function displayType(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatModuleDuration(status: string, totalSeconds: number): string {
  return status === "completed" ? formatDuration(totalSeconds) : "0s";
}

function buildAssessmentRows(
  report: TeacherStudentProgressReport
): Array<TeacherStudentItemReport & { module_id: number; module_title: string }> {
  return report.module_reports.flatMap((module) =>
    (module.item_reports ?? [])
      .filter((item) => item.item_type.endsWith("_assessment"))
      .map((item) => ({
        ...item,
        module_id: module.module_id,
        module_title: module.module_title
      }))
  );
}

function studentDisplayName(
  student: TeacherSectionSummary["section"]["students"][number]
): string {
  const fullName = [student.first_name, student.last_name].filter(Boolean).join(" ").trim();
  return fullName || student.username;
}

export default function TeacherReportsPage() {
  const params = useSearchParams();
  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [allStudents, setAllStudents] = useState<StudentTableRow[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(params.get("studentSection") ?? "all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<StudentTableRow | null>(null);
  const [detailReport, setDetailReport] = useState<TeacherStudentProgressReport | null>(null);
  const [selectedDetailModuleId, setSelectedDetailModuleId] = useState<number | "all">("all");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [sectionsData, reportRowsData] = await Promise.all([
          getTeacherSections(),
          getTeacherReportStudents()
        ]);
        setSections(sectionsData);

        const reportMap = new Map<number, TeacherStudentReportRow>();
        for (const row of reportRowsData.students) {
          reportMap.set(row.student_id, row);
        }

        const studentMap = new Map<number, StudentTableRow>();
        for (const sectionEntry of sectionsData) {
          const sectionInfo = sectionEntry.section;
          for (const student of sectionInfo.students) {
            const reportRow = reportMap.get(student.id);
            studentMap.set(student.id, {
              student_id: student.id,
              student_name: studentDisplayName(student),
              student_email: student.email ?? null,
              section_id: sectionInfo.id,
              section_name: sectionInfo.name,
              total_assessments: reportRow?.total_assessments ?? 0,
              pending_reports: reportRow?.pending_reports ?? 0,
              generated_reports: reportRow?.generated_reports ?? 0,
              average_score_percent: reportRow?.average_score_percent ?? 0,
              latest_activity_at: reportRow?.latest_activity_at ?? null
            });
          }
        }

        const rows = Array.from(studentMap.values()).sort((a, b) => {
          const aTime = a.latest_activity_at ? new Date(a.latest_activity_at).getTime() : 0;
          const bTime = b.latest_activity_at ? new Date(b.latest_activity_at).getTime() : 0;
          if (bTime !== aTime) {
            return bTime - aTime;
          }
          return a.student_name.localeCompare(b.student_name);
        });
        setAllStudents(rows);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load teacher reports.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allStudents.filter((row) => {
      const sectionOk = selectedSectionId === "all" || String(row.section_id) === selectedSectionId;
      if (!sectionOk) {
        return false;
      }
      if (!term) {
        return true;
      }
      const haystack = `${row.student_name} ${row.student_email ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [allStudents, search, selectedSectionId]);

  const assessmentRows = useMemo(() => {
    if (!detailReport) {
      return [];
    }
    const allRows = buildAssessmentRows(detailReport);
    if (selectedDetailModuleId === "all") {
      return allRows;
    }
    return allRows.filter((entry) => entry.module_id === selectedDetailModuleId);
  }, [detailReport, selectedDetailModuleId]);

  async function onViewDetails(row: StudentTableRow) {
    setSelectedStudent(row);
    setDetailReport(null);
    setSelectedDetailModuleId("all");
    setDetailError(null);
    setIsDetailLoading(true);
    try {
      const report = await getTeacherStudentProgressReport(row.student_id);
      setDetailReport(report);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "Unable to load student details.");
    } finally {
      setIsDetailLoading(false);
    }
  }

  function closeDetails() {
    setSelectedStudent(null);
    setDetailReport(null);
    setSelectedDetailModuleId("all");
    setDetailError(null);
    setIsDetailLoading(false);
  }

  return (
    <section className="space-y-4">
      <div className="panel">
        <p className="text-xs fw-semibold text-uppercase tracking-[0.2em] text-brandBlue">Teacher LMS</p>
        <h2 className="mt-2 text-3xl fw-bold title-gradient">Student Reports</h2>
        <p className="mt-2 text-sm text-slate-700">
          View all students, filter by section, search by name, and open full progress details.
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger mb-0" role="alert">
          {error}
        </div>
      ) : null}

      <div className="panel">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label fw-semibold mb-1">Section Filter</label>
            <select
              className="form-select"
              onChange={(event) => setSelectedSectionId(event.target.value)}
              value={selectedSectionId}
            >
              <option value="all">All Sections</option>
              {sections.map((entry) => (
                <option key={entry.section.id} value={entry.section.id}>
                  {entry.section.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-8">
            <label className="form-label fw-semibold mb-1">Search Student</label>
            <input
              className="form-control"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by student name or email..."
              type="text"
              value={search}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h3 className="h5 fw-bold mb-0">Student Table</h3>
          <span className="badge text-bg-light border">Showing {filteredStudents.length}</span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Section</th>
                <th>Total Assessments</th>
                <th>Average Score</th>
                <th>Latest Activity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="text-muted" colSpan={7}>
                    Loading students...
                  </td>
                </tr>
              ) : null}
              {!isLoading && filteredStudents.length === 0 ? (
                <tr>
                  <td className="text-muted" colSpan={7}>
                    No students found for this filter/search.
                  </td>
                </tr>
              ) : null}
              {!isLoading
                ? filteredStudents.map((row) => (
                    <tr key={row.student_id}>
                      <td className="fw-semibold">{row.student_name}</td>
                      <td>{row.student_email || "-"}</td>
                      <td>{row.section_name}</td>
                      <td>{row.total_assessments}</td>
                      <td>{formatPercent(row.average_score_percent)}</td>
                      <td>{formatDateTime(row.latest_activity_at)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => void onViewDetails(row)}
                          type="button"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStudent ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Student Details: {selectedStudent.student_name}
                </h5>
                <button aria-label="Close" className="btn-close" onClick={closeDetails} type="button" />
              </div>
              <div className="modal-body">
                {isDetailLoading ? (
                  <p className="mb-0 text-muted">Loading detailed report...</p>
                ) : null}
                {detailError ? (
                  <div className="alert alert-danger mb-0" role="alert">
                    {detailError}
                  </div>
                ) : null}

                {detailReport ? (
                  <div className="vstack gap-4">
                    <div className="row g-3">
                      <div className="col-md-4">
                        <div className="rounded-3 bg-brandOffWhite px-3 py-3 h-100">
                          <p className="text-xs text-uppercase tracking-[0.14em] text-slate-500 mb-1">Section</p>
                          <p className="mb-0 fw-semibold">{detailReport.section?.name ?? selectedStudent.section_name}</p>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="rounded-3 bg-brandOffWhite px-3 py-3 h-100">
                          <p className="text-xs text-uppercase tracking-[0.14em] text-slate-500 mb-1">Current Finished Module</p>
                          <p className="mb-0 fw-semibold">{detailReport.current_finished_module ?? "No finished module yet"}</p>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="rounded-3 bg-brandOffWhite px-3 py-3 h-100">
                          <p className="text-xs text-uppercase tracking-[0.14em] text-slate-500 mb-1">Verdict / Focus</p>
                          <p className="mb-0">{detailReport.verdict}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h6 className="fw-bold mb-2">General Module Progress</h6>
                      <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                          <thead>
                            <tr>
                              <th>Module</th>
                              <th>Status</th>
                              <th>Progress</th>
                              <th>Correct</th>
                              <th>Mistakes</th>
                              <th>Attempts</th>
                              <th>Duration</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailReport.module_reports.map((module) => (
                              <tr key={module.module_id}>
                                <td className="fw-semibold">{module.module_title}</td>
                                <td className="text-capitalize">{displayStatus(module.status)}</td>
                                <td>{module.progress_percent}%</td>
                                <td>{module.correct_count}</td>
                                <td>{module.wrong_count}</td>
                                <td>{module.attempt_count}</td>
                                <td>{formatModuleDuration(module.status, module.total_duration_seconds)}</td>
                                <td>
                                  <button
                                    className={`btn btn-sm ${selectedDetailModuleId === module.module_id ? "btn-primary" : "btn-outline-primary"}`}
                                    onClick={() => setSelectedDetailModuleId(module.module_id)}
                                    type="button"
                                  >
                                    View in Detailed
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                        <h6 className="fw-bold mb-0">Assessment Details</h6>
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge text-bg-light border">
                            {selectedDetailModuleId === "all"
                              ? "Showing all modules"
                              : `Filtered by module ${selectedDetailModuleId}`}
                          </span>
                          {selectedDetailModuleId !== "all" ? (
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => setSelectedDetailModuleId("all")}
                              type="button"
                            >
                              Show All
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                          <thead>
                            <tr>
                              <th>Module</th>
                              <th>Assessment</th>
                              <th>Type</th>
                              <th>Status</th>
                              <th>Score</th>
                              <th>Attempts</th>
                              <th>Assessment Duration</th>
                              <th>Completed At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assessmentRows.length === 0 ? (
                              <tr>
                                <td className="text-muted" colSpan={8}>
                                  No assessment details yet.
                                </td>
                              </tr>
                            ) : (
                              assessmentRows.map((item) => (
                                <tr key={item.item_id}>
                                  <td className="fw-semibold">{item.module_title}</td>
                                  <td>
                                    {item.order_index}. {item.item_title}
                                  </td>
                                  <td>{displayType(item.item_type)}</td>
                                  <td className="text-capitalize">{displayStatus(item.status)}</td>
                                  <td>{item.score_percent === null || item.score_percent === undefined ? "-" : `${item.score_percent.toFixed(1)}%`}</td>
                                  <td>{item.attempt_count}</td>
                                  <td>{formatDuration(item.duration_seconds)}</td>
                                  <td>{formatDateTime(item.completed_at)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeDetails} type="button">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
