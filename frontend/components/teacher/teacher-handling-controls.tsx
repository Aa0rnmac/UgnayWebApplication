"use client";

import {
  TeacherBatch,
  TeacherHandlingSession,
  TeacherPresence,
  TeacherUserSummary,
} from "@/lib/api";

type TeacherHandlingControlsProps = {
  activeSession: TeacherHandlingSession | null;
  batches: TeacherBatch[];
  presence: TeacherPresence | null;
  sessionBusy: boolean;
  sessionError: string | null;
  sessionMode: "student" | "batch";
  sessionBatchId: string;
  sessionStudentId: string;
  students: TeacherUserSummary[];
  onModeChange: (value: "student" | "batch") => void;
  onBatchChange: (value: string) => void;
  onStudentChange: (value: string) => void;
  onTogglePresence: (nextStatus: "online" | "offline") => void;
  onStartSession: () => void;
  onEndSession: () => void;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No activity yet";
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

export function TeacherHandlingControls({
  activeSession,
  batches,
  presence,
  sessionBusy,
  sessionError,
  sessionMode,
  sessionBatchId,
  sessionStudentId,
  students,
  onModeChange,
  onBatchChange,
  onStudentChange,
  onTogglePresence,
  onStartSession,
  onEndSession,
}: TeacherHandlingControlsProps) {
  return (
    <section className="panel space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
            Teacher Runtime
          </p>
          <h3 className="teacher-panel-heading mt-2 text-2xl font-black">
            Control teacher availability and handling sessions
          </h3>
          <p className="teacher-panel-copy mt-2 text-sm">
            Go online before starting a session. Session timestamps determine which teacher handled
            student work for attribution and reporting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
            {presence ? `Status: ${presence.status}` : "Loading status"}
          </span>
          <button
            className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition"
            disabled={sessionBusy || presence?.status === "online"}
            onClick={() => onTogglePresence("online")}
            type="button"
          >
            Go Online
          </button>
          <button
            className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition"
            disabled={sessionBusy || presence?.status === "offline"}
            onClick={() => onTogglePresence("offline")}
            type="button"
          >
            Go Offline
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-[28px] border border-black/10 bg-black/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Start Session
          </p>
          <p className="teacher-card-copy mt-2 text-sm">
            Pick a batch or a specific student. Student sessions override batch sessions when both
            exist in the system.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                sessionMode === "student"
                  ? "border-brandBlue/40 bg-brandBlue/10 text-brandBlue"
                  : "border-black/10 bg-white/70 text-slate-700"
              }`}
              onClick={() => onModeChange("student")}
              type="button"
            >
              Student Session
            </button>
            <button
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                sessionMode === "batch"
                  ? "border-brandBlue/40 bg-brandBlue/10 text-brandBlue"
                  : "border-black/10 bg-white/70 text-slate-700"
              }`}
              onClick={() => onModeChange("batch")}
              type="button"
            >
              Batch Session
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandGreen">
                Batch
              </span>
              <select
                className="teacher-card-control"
                onChange={(event) => onBatchChange(event.target.value)}
                value={sessionBatchId}
              >
                <option value="">Select batch</option>
                {batches
                  .filter((batch) => batch.status === "active")
                  .map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandBlue">
                Student
              </span>
              <select
                className="teacher-card-control"
                disabled={sessionMode === "batch"}
                onChange={(event) => onStudentChange(event.target.value)}
                value={sessionStudentId}
              >
                <option value="">
                  {sessionMode === "batch" ? "Batch-wide session" : "Select student"}
                </option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              disabled={
                sessionBusy ||
                Boolean(activeSession) ||
                (sessionMode === "student" ? !sessionStudentId : !sessionBatchId)
              }
              onClick={onStartSession}
              type="button"
            >
              {sessionBusy ? "Working..." : "Start Handling Session"}
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-black/10 bg-black/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Current Session
          </p>
          {activeSession ? (
            <div className="mt-3 space-y-2">
              <p className="teacher-card-title text-lg font-black">
                {activeSession.student
                  ? `Student: ${activeSession.student.full_name}`
                  : activeSession.batch
                    ? `Batch: ${activeSession.batch.name}`
                    : "Active session"}
              </p>
              <p className="teacher-card-copy text-sm">
                Started {formatDateTime(activeSession.started_at)}
              </p>
              <p className="teacher-card-meta text-xs">
                {activeSession.student
                  ? "Student-specific session overrides the student's batch assignment."
                  : "Batch session applies to approved students in the selected batch."}
              </p>
              <button
                className="mt-3 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-white"
                disabled={sessionBusy}
                onClick={onEndSession}
                type="button"
              >
                End Session
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-[22px] border border-dashed border-black/10 bg-white/70 px-4 py-5">
              <p className="teacher-card-copy text-sm">
                No active handling session. Students fall back to their batch primary teacher or the
                baseline curriculum.
              </p>
            </div>
          )}
        </div>
      </div>

      {sessionError ? <p className="text-sm text-red-700">Error: {sessionError}</p> : null}
    </section>
  );
}
