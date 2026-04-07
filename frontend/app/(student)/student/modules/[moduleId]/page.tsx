"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getModules, ModuleItem } from "@/lib/api";

export default function StudentModuleDetailPage() {
  const params = useParams<{ moduleId: string }>();
  const moduleId = Number(params.moduleId);

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Number.isNaN(moduleId)) {
      setError("Invalid module id.");
      return;
    }

    setLoading(true);
    getModules()
      .then(setModules)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [moduleId]);

  const selected = useMemo(
    () => modules.find((module) => module.id === moduleId) ?? null,
    [modules, moduleId]
  );

  return (
    <section className="space-y-4">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Learning Module</h2>
          <Link className="rounded border border-white/20 px-3 py-1 text-sm hover:bg-white/10" href="/student/modules">
            Back To Module Cards
          </Link>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted">Loading module...</p> : null}

      {!loading && !selected ? (
        <div className="panel">
          <p className="text-sm text-red-300">Module not found.</p>
        </div>
      ) : null}

      {selected ? (
        <article className="panel space-y-4">
          <div>
            <h3 className="text-xl font-semibold">{selected.title}</h3>
            <p className="mt-1 text-sm text-slate-200">{selected.description}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Lessons</p>
            <div className="mt-2 space-y-2">
              {selected.lessons.map((lesson) => (
                <div key={lesson.id} className="rounded border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-semibold">{lesson.title}</p>
                  <p className="mt-1 text-xs text-slate-300">{lesson.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Assessment</p>
            <div className="mt-2 space-y-2 rounded border border-white/10 bg-black/20 p-3">
              {selected.assessments.map((assessment) => (
                <div key={assessment.id}>
                  <p className="text-sm font-semibold">{assessment.question}</p>
                  <p className="mt-1 text-xs text-slate-300">Choices: {assessment.choices.join(" | ")}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      ) : null}

      {error ? <p className="text-sm text-red-300">Error: {error}</p> : null}
    </section>
  );
}
