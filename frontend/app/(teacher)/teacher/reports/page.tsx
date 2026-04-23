"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  getTeacherReportStudents,
  getTeacherSections,
  getTeacherStudentProgressReport,
  type TeacherSectionSummary,
  type TeacherStudentProgressReport,
  type TeacherStudentReportRow
} from "@/lib/api";

type StudentTableRow = {
  student_id: number;
  student_name: string;
  student_email: string | null;
  section_id: number;
  section_name: string;
  latest_activity_at: string | null;
  average_score_percent: number;
  pending_reports: number;
  total_assessments: number;
};

type AssessmentAttemptRow = {
  module_id: number;
  module_title: string;
  item_id: number;
  item_title: string;
  item_type: string;
  order_index: number;
  attempt_number: number;
  status: string;
  score_percent: number | null;
  correct_count: number;
  wrong_count: number;
  duration_seconds: number;
  completed_at: string | null;
};

type SummaryViewMode = "student_table" | "student_table_summary";

type BatchModuleSummary = {
  moduleTitle: string;
  scoreSamples: number[];
  correct: number;
  mistakes: number;
  attempts: number;
  durationSeconds: number;
};

type BatchSummaryRow = {
  kind: "batch";
  batchId: number;
  batchName: string;
  studentCount: number;
  averageScorePercent: number;
  totalCorrect: number;
  totalMistakes: number;
  totalAttempts: number;
  totalDurationSeconds: number;
  focusModuleTitle: string | null;
  focusMessage: string;
  summaryDetails: string[];
  supportStudents: string[];
};

type StudentSummaryRow = {
  kind: "student";
  batchId: number;
  batchName: string;
  studentId: number;
  studentName: string;
  averageScorePercent: number;
  totalCorrect: number;
  totalMistakes: number;
  totalAttempts: number;
  totalDurationSeconds: number;
  focusModuleTitle: string | null;
  focusMessage: string;
  summaryDetails: string[];
  supportStudents: string[];
};

type SummaryTableRow = BatchSummaryRow | StudentSummaryRow;

type SummaryRecommendation = {
  level: string;
  combinedResult: string;
  recommendations: string[];
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

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

function studentDisplayName(
  student: TeacherSectionSummary["section"]["students"][number]
): string {
  const fullName = [student.first_name, student.last_name].filter(Boolean).join(" ").trim();
  return fullName || student.username;
}

function buildAssessmentAttemptRows(report: TeacherStudentProgressReport): AssessmentAttemptRow[] {
  const rows: AssessmentAttemptRow[] = [];
  const passThreshold = 75;

  for (const module of report.module_reports) {
    for (const item of module.item_reports ?? []) {
      if (!item.item_type.endsWith("_assessment")) {
        continue;
      }

      const attemptDetails = item.attempt_details ?? [];
      if (attemptDetails.length > 0) {
        const lastAttemptNumber = Math.max(
          ...attemptDetails.map((attempt) => Math.max(1, attempt.attempt_number || 1))
        );
        for (const attempt of attemptDetails) {
          const attemptNumber = Math.max(1, attempt.attempt_number || 1);
          const derivedScore =
            attempt.score_percent ?? (attemptNumber === lastAttemptNumber ? item.score_percent ?? null : null);
          const derivedCorrect =
            item.item_type === "upload_assessment" &&
            (attempt.correct_count ?? 0) === 0 &&
            (attempt.wrong_count ?? 0) === 0 &&
            typeof derivedScore === "number"
              ? (derivedScore >= passThreshold ? 1 : 0)
              : Math.max(0, attempt.correct_count ?? 0);
          const derivedWrong =
            item.item_type === "upload_assessment" &&
            (attempt.correct_count ?? 0) === 0 &&
            (attempt.wrong_count ?? 0) === 0 &&
            typeof derivedScore === "number"
              ? (derivedScore >= passThreshold ? 0 : 1)
              : Math.max(0, attempt.wrong_count ?? 0);
          rows.push({
            module_id: module.module_id,
            module_title: module.module_title,
            item_id: item.item_id,
            item_title: item.item_title,
            item_type: item.item_type,
            order_index: item.order_index,
            attempt_number: attemptNumber,
            status: attempt.status || item.status,
            score_percent: derivedScore,
            correct_count: derivedCorrect,
            wrong_count: derivedWrong,
            duration_seconds: Math.max(0, attempt.duration_seconds ?? 0),
            completed_at: attempt.completed_at ?? null
          });
        }
        continue;
      }

      if ((item.attempt_count ?? 0) <= 0 && !item.completed_at) {
        continue;
      }
      rows.push({
        module_id: module.module_id,
        module_title: module.module_title,
        item_id: item.item_id,
        item_title: item.item_title,
        item_type: item.item_type,
        order_index: item.order_index,
        attempt_number: Math.max(item.attempt_count || 1, 1),
        status: item.status,
        score_percent: item.score_percent ?? null,
        correct_count: item.is_correct === true ? 1 : 0,
        wrong_count: item.is_correct === false ? 1 : 0,
        duration_seconds: Math.max(0, item.duration_seconds ?? 0),
        completed_at: item.completed_at ?? null
      });
    }
  }

  return rows;
}

function selectStudentSummaryModules(report: TeacherStudentProgressReport) {
  const completedModules = report.module_reports.filter((module) => module.status === "completed");
  const currentModule = report.module_reports.find((module) => module.status === "in_progress") ?? null;
  const finishedTitle = report.current_finished_module?.trim().toLowerCase() ?? "";
  const finishedModuleFromReport =
    finishedTitle.length > 0
      ? report.module_reports.find((module) => module.module_title.trim().toLowerCase() === finishedTitle) ?? null
      : null;
  const latestCompletedModule = completedModules.length > 0 ? completedModules[completedModules.length - 1] : null;
  const preferredCompletedModule = finishedModuleFromReport ?? latestCompletedModule;
  const selected: TeacherStudentProgressReport["module_reports"] = [];
  if (preferredCompletedModule) {
    selected.push(preferredCompletedModule);
  }
  if (
    currentModule &&
    (!preferredCompletedModule || currentModule.module_id !== preferredCompletedModule.module_id)
  ) {
    selected.push(currentModule);
  }
  return selected;
}

function buildSummaryRecommendation(row: SummaryTableRow): SummaryRecommendation {
  const totalChecks = row.totalCorrect + row.totalMistakes;
  const mistakeRate = totalChecks > 0 ? row.totalMistakes / totalChecks : 0;
  const attemptsPerCheck = totalChecks > 0 ? row.totalAttempts / totalChecks : row.totalAttempts;
  const durationPerAttempt =
    row.totalAttempts > 0 ? row.totalDurationSeconds / row.totalAttempts : row.totalDurationSeconds;

  let level = "Maintain Current Guidance";
  if (row.averageScorePercent < 60 || mistakeRate >= 0.45) {
    level = "Needs Immediate Teacher Support";
  } else if (row.averageScorePercent < 75 || mistakeRate >= 0.3) {
    level = "Needs Guided Reinforcement";
  } else if (row.averageScorePercent < 90 || attemptsPerCheck > 2.5) {
    level = "Progressing With Coaching";
  }

  const recommendations: string[] = [];
  if (row.focusModuleTitle) {
    recommendations.push(`Prioritize review on ${row.focusModuleTitle}.`);
  }
  if (row.kind === "batch" && row.supportStudents.length > 0) {
    const topNames = row.supportStudents.slice(0, 3).join(", ");
    const remaining = row.supportStudents.length - Math.min(row.supportStudents.length, 3);
    recommendations.push(
      `Focus teacher check-ins on ${topNames}${remaining > 0 ? ` (+${remaining} more)` : ""}.`
    );
  }
  if (row.kind === "student" && row.supportStudents.length > 0) {
    recommendations.push(`Provide targeted coaching to ${row.supportStudents[0]}.`);
  }
  if (attemptsPerCheck > 2.5) {
    recommendations.push("Reduce repeated retries by giving step-by-step practice before reassessment.");
  }
  if (durationPerAttempt > 90) {
    recommendations.push("Time per attempt is high; add short guided drills for speed and confidence.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Continue current learning strategy and monitor consistency.");
  }

  const combinedResult = `Combined result: ${row.averageScorePercent.toFixed(
    1
  )}% average score, ${row.totalCorrect} correct, ${row.totalMistakes} mistakes, ${row.totalAttempts} attempts, ${formatDuration(
    row.totalDurationSeconds
  )} total duration.`;

  return { level, combinedResult, recommendations };
}

export default function TeacherReportsPage() {
  const params = useSearchParams();
  const detailsSectionRef = useRef<HTMLDivElement | null>(null);
  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [allStudents, setAllStudents] = useState<StudentTableRow[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(params.get("studentSection") ?? "all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<SummaryViewMode>("student_table");
  const [batchSummaryRows, setBatchSummaryRows] = useState<SummaryTableRow[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [activeSummaryRow, setActiveSummaryRow] = useState<SummaryTableRow | null>(null);

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
              latest_activity_at: reportRow?.latest_activity_at ?? null,
              average_score_percent: reportRow?.average_score_percent ?? 0,
              pending_reports: reportRow?.pending_reports ?? 0,
              total_assessments: reportRow?.total_assessments ?? 0
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

  useEffect(() => {
    if (viewMode !== "student_table_summary") {
      return;
    }

    async function buildBatchSummary() {
      setIsSummaryLoading(true);
      setSummaryError(null);
      try {
        const uniqueStudents = new Map<number, StudentTableRow>();
        for (const student of filteredStudents) {
          uniqueStudents.set(student.student_id, student);
        }
        const students = Array.from(uniqueStudents.values());
        if (students.length === 0) {
          setBatchSummaryRows([]);
          return;
        }

        const reports = await Promise.all(
          students.map(async (student) => ({
            student,
            report: await getTeacherStudentProgressReport(student.student_id),
          }))
        );

        const grouped = new Map<
          number,
          {
            batchName: string;
            students: Array<{
              studentId: number;
              name: string;
              moduleSummaries: Map<string, BatchModuleSummary>;
              totalMistakes: number;
              totalAttempts: number;
              avgScorePercent: number;
            }>;
          }
        >();

        for (const entry of reports) {
          const batchId = entry.student.section_id;
          if (!grouped.has(batchId)) {
            grouped.set(batchId, { batchName: entry.student.section_name, students: [] });
          }

          const moduleSummaries = new Map<string, BatchModuleSummary>();
          let totalMistakes = 0;
          let totalAttempts = 0;
          let scoreSum = 0;
          let scoreCount = 0;

          const relevantModules = selectStudentSummaryModules(entry.report);
          for (const module of relevantModules) {
            const summary: BatchModuleSummary = {
              moduleTitle: module.module_title,
              scoreSamples: [],
              correct: Math.max(0, module.correct_count ?? 0),
              mistakes: Math.max(0, module.wrong_count ?? 0),
              attempts: 0,
              durationSeconds: Math.max(0, module.total_duration_seconds ?? 0),
            };

            for (const item of module.item_reports ?? []) {
              if (!item.item_type.endsWith("_assessment")) {
                continue;
              }
              totalAttempts += Math.max(0, item.attempt_count ?? 0);
              summary.attempts += Math.max(0, item.attempt_count ?? 0);
              if (typeof item.score_percent === "number") {
                summary.scoreSamples.push(item.score_percent);
                scoreSum += item.score_percent;
                scoreCount += 1;
              }
            }
            totalMistakes += summary.mistakes;
            moduleSummaries.set(module.module_title, summary);
          }

          grouped.get(batchId)?.students.push({
            studentId: entry.student.student_id,
            name: entry.student.student_name,
            moduleSummaries,
            totalMistakes,
            totalAttempts,
            avgScorePercent: scoreCount > 0 ? scoreSum / scoreCount : 0,
          });
        }

        const computedRows: SummaryTableRow[] = [];
        const isAllBatches = selectedSectionId === "all";
        for (const [batchId, value] of grouped.entries()) {
          let totalCorrect = 0;
          let totalMistakes = 0;
          let totalAttempts = 0;
          let totalDurationSeconds = 0;
          let batchScoreSum = 0;
          let batchScoreCount = 0;
          const moduleAggregates = new Map<
            string,
            { correct: number; mistakes: number; attempts: number; duration: number; scoreSamples: number[] }
          >();

          for (const student of value.students) {
            totalAttempts += student.totalAttempts;
            for (const module of student.moduleSummaries.values()) {
              totalCorrect += module.correct;
              totalMistakes += module.mistakes;
              totalDurationSeconds += module.durationSeconds;
              for (const sample of module.scoreSamples) {
                batchScoreSum += sample;
                batchScoreCount += 1;
              }
              if (!moduleAggregates.has(module.moduleTitle)) {
                moduleAggregates.set(module.moduleTitle, {
                  correct: 0,
                  mistakes: 0,
                  attempts: 0,
                  duration: 0,
                  scoreSamples: [],
                });
              }
              const agg = moduleAggregates.get(module.moduleTitle);
              if (agg) {
                agg.correct += module.correct;
                agg.mistakes += module.mistakes;
                agg.attempts += module.attempts;
                agg.duration += module.durationSeconds;
                agg.scoreSamples.push(...module.scoreSamples);
              }
            }
          }

          const weakestModule = Array.from(moduleAggregates.entries())
            .map(([moduleTitle, agg]) => {
              const moduleAverage =
                agg.scoreSamples.length > 0
                  ? agg.scoreSamples.reduce((sum, sample) => sum + sample, 0) / agg.scoreSamples.length
                  : 0;
              return {
                moduleTitle,
                correct: agg.correct,
                mistakes: agg.mistakes,
                attempts: agg.attempts,
                duration: agg.duration,
                averageScore: moduleAverage,
              };
            })
            .sort((left, right) => {
              if (right.mistakes !== left.mistakes) {
                return right.mistakes - left.mistakes;
              }
              return left.averageScore - right.averageScore;
            })[0];

          const batchModuleDetails = Array.from(moduleAggregates.entries())
            .map(([moduleTitle, agg]) => {
              const averageScore =
                agg.scoreSamples.length > 0
                  ? agg.scoreSamples.reduce((sum, sample) => sum + sample, 0) / agg.scoreSamples.length
                  : 0;
              return `${moduleTitle}: ${averageScore.toFixed(1)}% score, ${agg.correct} correct, ${agg.mistakes} mistakes, ${agg.attempts} attempts, ${formatDuration(agg.duration)} duration`;
            })
            .sort((left, right) => left.localeCompare(right));

          const supportStudents = [...value.students]
            .filter((student) => student.totalMistakes > 0 || student.avgScorePercent < 75)
            .sort((left, right) => {
              if (right.totalMistakes !== left.totalMistakes) {
                return right.totalMistakes - left.totalMistakes;
              }
              return left.avgScorePercent - right.avgScorePercent;
            })
            .map((student) => student.name);

          const focusModuleTitle = weakestModule?.moduleTitle ?? null;
          const focusMessage =
            focusModuleTitle
              ? `Need to focus more on ${focusModuleTitle} fundamentals.`
              : "Student progress is stable. Continue guided practice.";

          if (isAllBatches) {
            computedRows.push({
              kind: "batch",
              batchId,
              batchName: value.batchName,
              studentCount: value.students.length,
              averageScorePercent: batchScoreCount > 0 ? Number((batchScoreSum / batchScoreCount).toFixed(1)) : 0,
              totalCorrect,
              totalMistakes,
              totalAttempts,
              totalDurationSeconds,
              focusModuleTitle,
              focusMessage,
              summaryDetails: batchModuleDetails,
              supportStudents,
            });
          } else {
            for (const entry of reports.filter((row) => row.student.section_id === batchId)) {
              let studentCorrect = 0;
              let studentMistakes = 0;
              let studentAttempts = 0;
              let studentDuration = 0;
              let studentScoreSum = 0;
              let studentScoreCount = 0;
              const perModule = new Map<string, { mistakes: number; average: number }>();

              const relevantModules = selectStudentSummaryModules(entry.report);
              for (const module of relevantModules) {
                studentCorrect += Math.max(0, module.correct_count ?? 0);
                studentMistakes += Math.max(0, module.wrong_count ?? 0);
                studentDuration += Math.max(0, module.total_duration_seconds ?? 0);
                const moduleScores: number[] = [];
                for (const item of module.item_reports ?? []) {
                  if (!item.item_type.endsWith("_assessment")) {
                    continue;
                  }
                  studentAttempts += Math.max(0, item.attempt_count ?? 0);
                  if (typeof item.score_percent === "number") {
                    moduleScores.push(item.score_percent);
                    studentScoreSum += item.score_percent;
                    studentScoreCount += 1;
                  }
                }
                const moduleAverage =
                  moduleScores.length > 0
                    ? moduleScores.reduce((sum, score) => sum + score, 0) / moduleScores.length
                    : 0;
                perModule.set(module.module_title, {
                  mistakes: Math.max(0, module.wrong_count ?? 0),
                  average: moduleAverage,
                });
              }

              const weakest = Array.from(perModule.entries())
                .map(([title, values]) => ({ title, ...values }))
                .sort((left, right) => {
                  if (right.mistakes !== left.mistakes) {
                    return right.mistakes - left.mistakes;
                  }
                  return left.average - right.average;
                })[0];

              const studentAverage =
                studentScoreCount > 0 ? Number((studentScoreSum / studentScoreCount).toFixed(1)) : 0;
              const studentFocus =
                weakest && (weakest.mistakes > 0 || weakest.average < 75)
                  ? `Need to focus more on ${weakest.title} fundamentals.`
                  : "Student progress is stable. Continue guided practice.";

              const studentModuleDetails = Array.from(perModule.entries())
                .map(([moduleTitle, values]) => `${moduleTitle}: ${values.average.toFixed(1)}% score, ${values.mistakes} mistakes`)
                .sort((left, right) => left.localeCompare(right));

              computedRows.push({
                kind: "student",
                batchId,
                batchName: value.batchName,
                studentId: entry.student.student_id,
                studentName: entry.student.student_name,
                averageScorePercent: studentAverage,
                totalCorrect: studentCorrect,
                totalMistakes: studentMistakes,
                totalAttempts: studentAttempts,
                totalDurationSeconds: studentDuration,
                focusModuleTitle: weakest?.title ?? null,
                focusMessage: studentFocus,
                summaryDetails: studentModuleDetails,
                supportStudents:
                  studentMistakes > 0 || studentAverage < 75 ? [entry.student.student_name] : [],
              });
            }
          }
        }
        computedRows.sort((left, right) => {
          if (left.batchName !== right.batchName) {
            return left.batchName.localeCompare(right.batchName);
          }
          if (left.kind === "student" && right.kind === "student") {
            return left.studentName.localeCompare(right.studentName);
          }
          return 0;
        });
        setBatchSummaryRows(computedRows);
      } catch (requestError) {
        setSummaryError(
          requestError instanceof Error ? requestError.message : "Unable to build summary report."
        );
      } finally {
        setIsSummaryLoading(false);
      }
    }

    void buildBatchSummary();
  }, [filteredStudents, selectedSectionId, viewMode]);

  const assessmentRows = useMemo(() => {
    if (!detailReport) {
      return [];
    }
    const allRows = buildAssessmentAttemptRows(detailReport);
    if (selectedDetailModuleId === "all") {
      return allRows;
    }
    return allRows.filter((entry) => entry.module_id === selectedDetailModuleId);
  }, [detailReport, selectedDetailModuleId]);

  const activeSummaryRecommendation = useMemo(
    () => (activeSummaryRow ? buildSummaryRecommendation(activeSummaryRow) : null),
    [activeSummaryRow]
  );

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

  function onViewModuleDetails(moduleId: number) {
    setSelectedDetailModuleId(moduleId);
    window.requestAnimationFrame(() => {
      detailsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
        <p className="text-xs fw-semibold text-uppercase tracking-[0.2em] text-brandBlue">Teacher Reports</p>
        <h2 className="mt-2 text-3xl fw-bold title-gradient">Student Reports</h2>
        <p className="mt-2 text-sm text-slate-700">
          View all students, filter by batch, search by name, and open student progress details.
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger mb-0" role="alert">
          {error}
        </div>
      ) : null}

      <div className="panel">
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label fw-semibold mb-1">Batch Filter</label>
            <select
              className="form-select"
              onChange={(event) => setSelectedSectionId(event.target.value)}
              value={selectedSectionId}
            >
              <option value="all">All Batches</option>
              {sections.map((entry) => (
                <option key={entry.section.id} value={entry.section.id}>
                  {entry.section.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-5">
            <label className="form-label fw-semibold mb-1">Search Student</label>
            <input
              className="form-control"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by student name or email..."
              type="text"
              value={search}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-semibold mb-1">Table View</label>
            <select
              className="form-select"
              onChange={(event) => setViewMode(event.target.value as SummaryViewMode)}
              value={viewMode}
            >
              <option value="student_table">Student Table</option>
              <option value="student_table_summary">Student Table Summary</option>
            </select>
          </div>
        </div>
      </div>

      {viewMode === "student_table_summary" ? (
        <div className="panel">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h3 className="h5 fw-bold mb-0">Student Table Summary</h3>
            <span className="badge text-bg-light border">Showing {batchSummaryRows.length}</span>
          </div>
          {summaryError ? (
            <div className="alert alert-danger mb-3" role="alert">
              {summaryError}
            </div>
          ) : null}
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Batch</th>
                  {selectedSectionId === "all" ? <th>Students</th> : <th>Student</th>}
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {isSummaryLoading ? (
                  <tr>
                    <td className="text-muted" colSpan={3}>
                      Building summary...
                    </td>
                  </tr>
                ) : null}
                {!isSummaryLoading && batchSummaryRows.length === 0 ? (
                  <tr>
                    <td className="text-muted" colSpan={3}>
                      No summary data available for this filter.
                    </td>
                  </tr>
                ) : null}
                {!isSummaryLoading
                  ? batchSummaryRows.map((row) => (
                      <tr key={row.kind === "batch" ? `batch-${row.batchId}` : `student-${row.studentId}`}>
                        <td className="fw-semibold">{row.batchName}</td>
                        <td>{row.kind === "batch" ? row.studentCount : row.studentName}</td>
                        <td className="text-end">
                          <button
                            className="btn btn-sm btn-outline-primary fw-semibold"
                            onClick={() => setActiveSummaryRow(row)}
                            type="button"
                          >
                            View Summary Result
                          </button>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {viewMode === "student_table" ? (
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
                <th>Batch</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="text-muted" colSpan={4}>
                    Loading students...
                  </td>
                </tr>
              ) : null}
              {!isLoading && filteredStudents.length === 0 ? (
                <tr>
                  <td className="text-muted" colSpan={4}>
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
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => void onViewDetails(row)}
                          type="button"
                        >
                          View Progress
                        </button>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}

      {activeSummaryRow ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Summary Result - {activeSummaryRow.kind === "batch" ? activeSummaryRow.batchName : activeSummaryRow.studentName}
                </h5>
                <button
                  aria-label="Close"
                  className="btn-close"
                  onClick={() => setActiveSummaryRow(null)}
                  type="button"
                />
              </div>
              <div className="modal-body vstack gap-3">
                <div className="rounded-3 border border-brandBorder bg-brandOffWhite px-3 py-3">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <p className="mb-0 fw-semibold text-brandBlue">System Evaluation</p>
                    {activeSummaryRecommendation ? (
                      <span className="badge text-bg-light border">{activeSummaryRecommendation.level}</span>
                    ) : null}
                  </div>
                  {activeSummaryRecommendation ? (
                    <p className="mb-0 mt-2">{activeSummaryRecommendation.combinedResult}</p>
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 fw-semibold">Teacher Action Plan</p>
                  {activeSummaryRecommendation?.recommendations?.length ? (
                    <ul className="mb-0 list-group">
                      {activeSummaryRecommendation.recommendations.map((recommendation, index) => (
                        <li className="list-group-item" key={`recommendation-${index}`}>
                          {recommendation}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-0 text-muted">No recommendations available yet.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 fw-semibold">Module Summary Basis</p>
                  {activeSummaryRow.summaryDetails.length === 0 ? (
                    <p className="mb-0 text-muted">No module details yet.</p>
                  ) : (
                    <ul className="mb-0 list-group">
                      {activeSummaryRow.summaryDetails.map((detail, index) => (
                        <li className="list-group-item" key={`${activeSummaryRow.batchId}-${index}`}>
                          {detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {activeSummaryRow.kind === "batch" ? (
                  <div>
                    <p className="mb-2 fw-semibold">Students Who Need Teacher Help</p>
                    {activeSummaryRow.supportStudents.length === 0 ? (
                      <p className="mb-0 text-muted">No immediate support list. Continue guided practice.</p>
                    ) : (
                      <ul className="mb-0 list-group">
                        {activeSummaryRow.supportStudents.map((studentName, index) => (
                          <li className="list-group-item" key={`${studentName}-${index}`}>
                            {studentName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setActiveSummaryRow(null)} type="button">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                          <p className="text-xs text-uppercase tracking-[0.14em] text-slate-500 mb-1">Batch</p>
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
                                <td>{formatModuleDuration(module.status, module.total_duration_seconds)}</td>
                                <td>
                                  <button
                                    className={`btn btn-sm ${selectedDetailModuleId === module.module_id ? "btn-primary" : "btn-outline-primary"}`}
                                    onClick={() => onViewModuleDetails(module.module_id)}
                                    type="button"
                                  >
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div ref={detailsSectionRef}>
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
                              <th>Attempt</th>
                              <th>Status</th>
                              <th>Score</th>
                              <th>Correct</th>
                              <th>Mistakes</th>
                              <th>Duration</th>
                              <th>Completed At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assessmentRows.length === 0 ? (
                              <tr>
                                <td className="text-muted" colSpan={10}>
                                  No assessment details yet.
                                </td>
                              </tr>
                            ) : (
                              assessmentRows.map((item) => (
                                <tr key={`${item.item_id}-${item.attempt_number}-${item.completed_at ?? "none"}`}>
                                  <td className="fw-semibold">{item.module_title}</td>
                                  <td>{item.item_title}</td>
                                  <td>{displayType(item.item_type)}</td>
                                  <td>{item.attempt_number}</td>
                                  <td className="text-capitalize">{displayStatus(item.status)}</td>
                                  <td>{formatScore(item.score_percent)}</td>
                                  <td>{item.correct_count}</td>
                                  <td>{item.wrong_count}</td>
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
