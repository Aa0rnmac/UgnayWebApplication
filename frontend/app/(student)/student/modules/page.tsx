"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getModules, ModuleItem } from "@/lib/api";

const CARD_THEMES = [
  {
    shell: "bg-[#f41328]",
    border: "border-[#f2f2f2]",
    media: "from-[#ece51e] to-[#f7f3a3]",
    hand: "A"
  },
  {
    shell: "bg-[#49b649]",
    border: "border-[#f2f2f2]",
    media: "from-[#f2f2f2] to-[#dae5ef]",
    hand: "2"
  },
  {
    shell: "bg-[#ece51e] text-black",
    border: "border-[#f2f2f2]",
    media: "from-[#d7ddf3] to-[#4655a6]",
    hand: "Hi"
  }
] as const;

function cardTheme(module: ModuleItem) {
  return CARD_THEMES[(module.order_index - 1) % CARD_THEMES.length];
}

export default function StudentModulesPage() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getModules()
      .then((data) => {
        setModules(data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-4">
      <div className="panel">
        <h2 className="text-2xl font-semibold">Learning Modules</h2>
        <p className="mt-2 text-sm text-muted">Choose a module card to open that module only.</p>
      </div>

      {loading ? <p className="text-sm text-muted">Loading modules...</p> : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const theme = cardTheme(module);
          const bodyTextClass = theme.shell.includes("text-black") ? "text-black/90" : "text-white";

          const cardContent = (
            <article
              className={`relative h-full overflow-hidden rounded-[28px] border-2 p-4 shadow-soft transition hover:-translate-y-1 ${theme.shell} ${theme.border}`}
            >
              <div className={`h-52 rounded-[22px] border-2 ${theme.border} bg-gradient-to-br ${theme.media}`}>
                <div className="flex h-full items-center justify-center text-7xl font-black tracking-tight">
                  {theme.hand}
                </div>
              </div>
              <h3 className={`mt-4 text-3xl font-black leading-tight ${bodyTextClass}`}>
                Module {module.order_index}: {module.title.replace(/^Module \d+:\s*/i, "")}
              </h3>
              <p className={`mt-2 text-sm ${bodyTextClass} opacity-90`}>{module.description}</p>
            </article>
          );

          return (
            <Link key={module.id} href={`/student/modules/${module.id}`}>
              {cardContent}
            </Link>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-300">Error: {error}</p> : null}
    </section>
  );
}
