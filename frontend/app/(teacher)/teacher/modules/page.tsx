"use client";

import { useEffect, useMemo, useState } from "react";

import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";
import { TeacherModuleItem, getTeacherModuleCatalog } from "@/lib/api";

function formatLessonCount(count: number) {
  return `${count} lesson${count === 1 ? "" : "s"}`;
}

function getModuleEyebrow(module: TeacherModuleItem) {
  if (module.is_placeholder) {
    return "Coming Soon";
  }
  return formatLessonCount(module.lessons.length);
}

function getModuleCta(module: TeacherModuleItem) {
  return module.is_placeholder ? "Preview Placeholder" : "Open Lesson View";
}

export default function TeacherModulesPage() {
  const [modules, setModules] = useState<TeacherModuleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getTeacherModuleCatalog()
      .then(setModules)
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const liveModules = useMemo(
    () => modules.filter((module) => !module.is_placeholder),
    [modules]
  );
  const placeholderModules = useMemo(
    () => modules.filter((module) => module.is_placeholder),
    [modules]
  );
  const liveLessonCount = useMemo(
    () =>
      liveModules.reduce((total, module) => total + module.lessons.length, 0),
    [liveModules]
  );

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
          Teacher Modules
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">
          Open every module from one teacher-safe lesson workspace.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          This view now pulls live module data for teachers while intentionally hiding
          assessments, student scores, and activity controls. Phase 1 focuses only on lesson
          access and placeholder visibility for the full 12-module lane.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Live Modules
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">{liveModules.length}</p>
          <p className="mt-2 text-sm text-slate-300">
            Published modules with lesson content ready for teacher viewing.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Placeholder Cards
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">
            {placeholderModules.length}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Future module slots already visible in the teacher workspace.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Lessons Ready
          </p>
          <p className="mt-3 text-4xl font-black text-brandWhite">{liveLessonCount}</p>
          <p className="mt-2 text-sm text-slate-300">
            Total published lesson entries currently available across the live modules.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <p className="text-sm text-slate-300">Loading teacher module catalog...</p>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module, index) => (
          <TeacherWorkspaceCard
            key={`${module.id}-${module.order_index}`}
            badge={`M${String(module.order_index).padStart(2, "0")}`}
            ctaLabel={getModuleCta(module)}
            description={module.description}
            eyebrow={getModuleEyebrow(module)}
            href={`/teacher/modules/${module.id}`}
            themeIndex={index}
            title={module.title}
          />
        ))}
      </div>

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-300">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
