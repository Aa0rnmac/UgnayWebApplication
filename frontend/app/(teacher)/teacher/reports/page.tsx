"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getTeacherSection, getTeacherSections, getTeacherStudentProgressReport, type LmsSection, type TeacherSectionSummary, type TeacherStudentProgressReport } from "@/lib/api";

export default function TeacherReportsPage() {
  const params = useSearchParams();
  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [section, setSection] = useState<LmsSection | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState(params.get("studentSection") ?? "");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [report, setReport] = useState<TeacherStudentProgressReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeacherSections()
      .then(async (data) => {
        setSections(data);
        const initial = params.get("studentSection") ?? (data[0] ? String(data[0].section.id) : "");
        setSelectedSectionId(initial);
        if (initial) {
          const sectionData = await getTeacherSection(Number(initial));
          setSection(sectionData);
        }
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, [params]);

  const studentOptions = useMemo(() => section?.students ?? [], [section]);

  async function onLoadSection(sectionId: string) {
    setSelectedSectionId(sectionId);
    setSelectedStudentId("");
    setReport(null);
    if (!sectionId) {
      setSection(null);
      return;
    }
    try {
      setSection(await getTeacherSection(Number(sectionId)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load section.");
    }
  }

  async function onLoadReport(studentId: string) {
    setSelectedStudentId(studentId);
    if (!studentId) {
      setReport(null);
      return;
    }
    try {
      setReport(await getTeacherStudentProgressReport(Number(studentId)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load report.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Teacher LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Student Reports</h2>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="panel text-sm font-semibold text-slate-800">
          Section
          <select className="mt-2 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => void onLoadSection(event.target.value)} value={selectedSectionId}>
            <option value="">Choose a section</option>
            {sections.map((entry) => (
              <option key={entry.section.id} value={entry.section.id}>
                {entry.section.name}
              </option>
            ))}
          </select>
        </label>
        <label className="panel text-sm font-semibold text-slate-800">
          Student
          <select className="mt-2 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => void onLoadReport(event.target.value)} value={selectedStudentId}>
            <option value="">Choose a student</option>
            {studentOptions.map((student) => (
              <option key={student.id} value={student.id}>
                {student.username}
              </option>
            ))}
          </select>
        </label>
      </div>

      {report ? (
        <>
          <div className="panel">
            <p className="text-xs uppercase tracking-[0.22em] label-accent">Student Summary</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{report.student.username}</h3>
            <p className="mt-2 text-sm text-slate-700">{report.verdict}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-brandOffWhite px-4 py-4 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Section</p>
                <p className="mt-2 font-semibold">{report.section?.name ?? "Not assigned"}</p>
              </div>
              <div className="rounded-xl bg-brandOffWhite px-4 py-4 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current Finished Module</p>
                <p className="mt-2 font-semibold">{report.current_finished_module ?? "No finished module yet"}</p>
              </div>
            </div>
          </div>

          <div className="panel">
            <p className="text-xs uppercase tracking-[0.22em] label-accent">Module Progress</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                    <th className="px-2 py-3">Module</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-2 py-3">Progress</th>
                    <th className="px-2 py-3">Correct</th>
                    <th className="px-2 py-3">Wrong</th>
                    <th className="px-2 py-3">Attempts</th>
                    <th className="px-2 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {report.module_reports.map((module) => (
                    <tr className="border-b border-brandBorder/70" key={module.module_id}>
                      <td className="px-2 py-3 font-semibold text-slate-900">{module.module_title}</td>
                      <td className="px-2 py-3 capitalize text-slate-700">{module.status.replaceAll("_", " ")}</td>
                      <td className="px-2 py-3 text-slate-700">{module.progress_percent}%</td>
                      <td className="px-2 py-3 text-brandGreen">{module.correct_count}</td>
                      <td className="px-2 py-3 text-brandRed">{module.wrong_count}</td>
                      <td className="px-2 py-3 text-slate-700">{module.attempt_count}</td>
                      <td className="px-2 py-3 text-slate-700">{Math.round(module.total_duration_seconds / 60)} min</td>
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
