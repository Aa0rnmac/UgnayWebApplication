"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { TeacherModuleItem, getTeacherModuleDetail } from "@/lib/api";

function formatModuleLabel(module: TeacherModuleItem) {
  return `Module ${module.order_index}`;
}

export default function TeacherModuleDetailPage() {
  const params = useParams<{ moduleId: string }>();
  const moduleId = Number(params.moduleId);

  const [moduleItem, setModuleItem] = useState<TeacherModuleItem | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Number.isNaN(moduleId)) {
      setError("Invalid module id.");
      setModuleItem(null);
      return;
    }

    setLoading(true);
    setError(null);

    getTeacherModuleDetail(moduleId)
      .then((response) => {
        setModuleItem(response);
      })
      .catch((requestError: Error) => {
        setModuleItem(null);
        setError(requestError.message);
      })
      .finally(() => setLoading(false));
  }, [moduleId]);

  useEffect(() => {
    if (!moduleItem || moduleItem.is_placeholder) {
      setSelectedLessonId(null);
      return;
    }

    setSelectedLessonId(moduleItem.lessons[0]?.id ?? null);
  }, [moduleItem]);

  const selectedLesson = useMemo(() => {
    if (!moduleItem || moduleItem.is_placeholder) {
      return null;
    }
    return (
      moduleItem.lessons.find((lesson) => lesson.id === selectedLessonId) ??
      moduleItem.lessons[0] ??
      null
    );
  }, [moduleItem, selectedLessonId]);

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Teacher Lesson View
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">
              {moduleItem ? formatModuleLabel(moduleItem) : "Teacher Module"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Lesson-only teacher access is active here. Assessments, answers, scores, and student
              controls are intentionally hidden in Phase 1.
            </p>
          </div>

          <Link
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-brandWhite transition hover:bg-white/10"
            href="/teacher/modules"
          >
            Back To Modules
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="text-sm text-slate-300">Loading teacher module...</p>
        </div>
      ) : null}

      {!loading && moduleItem ? (
        <>
          <div className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              {formatModuleLabel(moduleItem)}
            </p>
            <h3 className="mt-3 text-3xl font-black text-brandWhite">{moduleItem.title}</h3>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-300">
              {moduleItem.description}
            </p>
          </div>

          {moduleItem.is_placeholder ? (
            <div className="panel">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
                Coming Soon
              </p>
              <h3 className="mt-3 text-2xl font-black text-brandWhite">
                This module slot is visible to reserve the full 12-module teacher flow.
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
                No lesson content has been published for this module yet. Once the content is ready,
                this screen can switch from placeholder state to the same teacher-safe lesson view
                used by the live modules.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
              <aside className="panel">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                  Lesson List
                </p>
                <div className="mt-4 space-y-3">
                  {moduleItem.lessons.length > 0 ? (
                    moduleItem.lessons.map((lesson, index) => (
                      <button
                        className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          selectedLesson?.id === lesson.id
                            ? "border-brandGreen bg-brandGreenLight text-slate-900"
                            : "border-white/10 bg-black/20 text-slate-200 hover:bg-black/30"
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
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
                    <h3 className="mt-3 text-3xl font-black text-brandWhite">
                      {selectedLesson.title}
                    </h3>
                    <p className="mt-4 whitespace-pre-line text-sm leading-8 text-slate-200">
                      {selectedLesson.content}
                    </p>
                  </>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                    Pick a lesson from the left panel to read its content.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : null}

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-300">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
