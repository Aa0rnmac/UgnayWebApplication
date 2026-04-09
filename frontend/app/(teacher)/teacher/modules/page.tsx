"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";
import { TeacherModuleCatalogData, getTeacherModuleCatalogData } from "@/lib/teacher-data";

export default function TeacherModulesPage() {
  const [data, setData] = useState<TeacherModuleCatalogData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeacherModuleCatalogData()
      .then(setData)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
          Teacher Modules
        </p>
        <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
          Review live modules, draft slots, and practice guides from the real backend catalog.
        </h2>
        <p className="teacher-panel-copy mt-3 max-w-3xl text-sm leading-relaxed">
          Teachers now see the real module catalog, including live modules students can access and
          draft slots reserved for teacher review. Use this page to prep lessons, inspect built-in
          activities, and spot unpublished curriculum work before rollout.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white"
            href="/teacher/lab"
          >
            Open Shared Lab Prep
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Teacher-Visible Modules
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{data?.modules.length ?? 0}</p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Live plus draft module entries visible to teachers.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Lessons Ready
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{data?.totalLessons ?? 0}</p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Lesson entries teachers can open right now.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Built-In Activities
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">{data?.totalActivities ?? 0}</p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Backend-defined activities teachers can review before or after student practice.
          </p>
        </div>
      </div>

      {!data ? (
        <div className="panel">
          <p className="teacher-panel-copy text-sm">Loading teacher module catalog...</p>
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.modules.map((module, index) => {
            const practiceGuide = data.practiceGuides.find((guide) => guide.moduleId === module.id);

            return (
              <TeacherWorkspaceCard
                key={`${module.id}-${module.order_index}`}
                badge={`M${String(module.order_index).padStart(2, "0")}`}
                ctaLabel="Open Lesson View"
                description={
                  practiceGuide
                    ? `${module.description} Prep focus: ${practiceGuide.prepFocus}`
                    : module.description
                }
                eyebrow={`${module.is_published ? "Live" : "Draft"} | ${module.lessons.length} lesson${module.lessons.length === 1 ? "" : "s"} | ${module.activities.length} activit${module.activities.length === 1 ? "y" : "ies"}`}
                href={`/teacher/modules/${module.id}`}
                themeIndex={index}
                title={module.title}
              />
            );
          })}
        </div>
      ) : null}

      {error ? (
        <div className="panel">
          <p className="text-sm text-red-300">Error: {error}</p>
        </div>
      ) : null}
    </section>
  );
}
