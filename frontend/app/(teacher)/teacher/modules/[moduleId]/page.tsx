"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { TeacherModuleDetailData, getTeacherModuleDetailData } from "@/lib/teacher-data";

export default function TeacherModuleDetailPage() {
  const params = useParams<{ moduleId: string }>();
  const moduleId = Number(params.moduleId);

  const [data, setData] = useState<TeacherModuleDetailData | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Number.isNaN(moduleId)) {
      setError("Invalid module id.");
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    getTeacherModuleDetailData(moduleId)
      .then((response) => {
        setData(response);
      })
      .catch((requestError: Error) => {
        setData(null);
        setError(requestError.message);
      })
      .finally(() => setLoading(false));
  }, [moduleId]);

  useEffect(() => {
    if (!data?.module) {
      setSelectedLessonId(null);
      return;
    }

    setSelectedLessonId(data.module.lessons[0]?.id ?? null);
  }, [data]);

  const selectedLesson = useMemo(() => {
    if (!data?.module) {
      return null;
    }
    return (
      data.module.lessons.find((lesson) => lesson.id === selectedLessonId) ??
      data.module.lessons[0] ??
      null
    );
  }, [data, selectedLessonId]);

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Teacher Lesson View
            </p>
            <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
              {data?.module ? `Module ${data.module.order_index}` : "Teacher Module"}
            </h2>
            <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
              This detail page uses the real teacher-visible module record. Use it to review
              lesson content, inspect built-in activities, and prep the matching lab route before
              students attempt the module.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
              href="/teacher/modules"
            >
              Back To Modules
            </Link>
            <Link
              className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white"
              href="/teacher/lab"
            >
              Open Teacher Lab
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading teacher module...</p>
        </div>
      ) : null}

      {!loading && data?.module ? (
        <>
          <div className="panel">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
                  {data.module.is_published ? "Live module" : "Draft module"}
                </p>
                <h3 className="teacher-panel-heading mt-3 text-3xl font-black">{data.module.title}</h3>
                <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
                  {data.module.description}
                </p>
              </div>
              <div className="grid min-w-[220px] gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Lessons</p>
                  <p className="teacher-card-title mt-2 text-2xl font-black">
                    {data.module.lessons.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                    Built-In Activities
                  </p>
                  <p className="teacher-card-title mt-2 text-2xl font-black">
                    {data.module.activities.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                    Practice Lane
                  </p>
                  <p className="teacher-card-title mt-2 text-lg font-black">
                    {data.practiceGuide.labModeLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
            <aside className="panel">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                Lesson List
              </p>
              <div className="mt-4 space-y-3">
                {data.module.lessons.length > 0 ? (
                  data.module.lessons.map((lesson, index) => (
                    <button
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        selectedLesson?.id === lesson.id
                          ? "border-brandGreen bg-brandGreenLight text-slate-900"
                          : "border-white/10 bg-black/20 teacher-card-copy hover:bg-black/30"
                      }`}
                      key={lesson.id}
                      onClick={() => setSelectedLessonId(lesson.id)}
                      type="button"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] opacity-70">
                        Lesson {index + 1}
                      </p>
                      <p className="mt-2 font-semibold">{lesson.title}</p>
                    </button>
                  ))
                ) : (
                  <div className="teacher-card-copy rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                    No lessons have been added to this module yet.
                  </div>
                )}
              </div>
            </aside>

            <div className="panel">
              {selectedLesson ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
                    Selected Lesson
                  </p>
                  <h3 className="teacher-panel-heading mt-3 text-3xl font-black">
                    {selectedLesson.title}
                  </h3>
                  {data.module.activities.length ? (
                    <p className="teacher-card-meta mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.2em]">
                      {data.module.activities.length} activity
                      {data.module.activities.length === 1 ? "" : "ies"} are attached to this
                      module in the backend and can now be tracked through saved attempts.
                    </p>
                  ) : (
                    <p className="teacher-card-meta mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.2em]">
                      No activity definitions are attached to this module yet.
                    </p>
                  )}
                  <p className="teacher-card-copy mt-4 whitespace-pre-line text-sm leading-8">
                    {selectedLesson.content}
                  </p>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
                      Shared Lab Guidance
                    </p>
                    <p className="teacher-card-title mt-3 text-lg font-black">
                      {data.practiceGuide.labModeLabel}
                    </p>
                    <p className="teacher-card-copy mt-2 text-sm">
                      {data.practiceGuide.selectorHint}
                    </p>
                    <p className="teacher-card-meta mt-2 text-xs leading-relaxed">
                      {data.practiceGuide.prepFocus}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        className="rounded-lg bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
                        href="/teacher/lab"
                      >
                        Open Teacher Lab
                      </Link>
                      <Link
                        className="teacher-card-ghost-button rounded-lg border px-4 py-2 text-xs font-semibold transition hover:bg-white/10"
                        href="/lab"
                      >
                        Open Shared Lab
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className="teacher-card-copy rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                  Pick a lesson from the left panel to read its content.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
