"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getModules, ModuleItem } from "@/lib/api";

const CARD_THEMES = [
  {
    shellBg: "linear-gradient(145deg, #FFF8D6 0%, #fffdf1 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(212,168,0,0.13), transparent 40%), radial-gradient(circle at 0% 100%, rgba(46,68,168,0.06), transparent 44%)",
    mediaBg: "linear-gradient(145deg, #fff4bb 0%, #fffdf2 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandYellow/35 bg-brandYellow/15 text-[#8d6f00]"
  },
  {
    shellBg: "linear-gradient(145deg, #E8ECF8 0%, #f8f9fd 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(46,68,168,0.14), transparent 40%), radial-gradient(circle at 0% 100%, rgba(42,140,63,0.06), transparent 42%)",
    mediaBg: "linear-gradient(145deg, #dfe5f9 0%, #f6f8fe 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandBlue/30 bg-brandBlue/12 text-brandBlue"
  },
  {
    shellBg: "linear-gradient(145deg, #FDE8E8 0%, #fff8f8 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(204,40,40,0.13), transparent 40%), radial-gradient(circle at 0% 100%, rgba(212,168,0,0.06), transparent 42%)",
    mediaBg: "linear-gradient(145deg, #f9d9d9 0%, #fff5f5 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandRed/30 bg-brandRed/12 text-brandRed"
  },
  {
    shellBg: "linear-gradient(145deg, #E8F5EB 0%, #f8fcf9 100%)",
    overlayBg:
      "radial-gradient(circle at 92% 8%, rgba(42,140,63,0.13), transparent 40%), radial-gradient(circle at 0% 100%, rgba(46,68,168,0.06), transparent 42%)",
    mediaBg: "linear-gradient(145deg, #dff1e4 0%, #f7fcf8 100%)",
    borderColor: "#E2E2EA",
    chipClass: "border-brandGreen/30 bg-brandGreen/12 text-brandGreen"
  }
] as const;

function cardTheme(module: ModuleItem) {
  return CARD_THEMES[(module.order_index - 1) % CARD_THEMES.length];
}

const MODULE_CARD_MEDIA_BY_ORDER: Record<
  number,
  {
    type: "image" | "text";
    value: string;
    textClass?: string;
  }
> = {
  1: { type: "image", value: "/module-assets/cards/module-1.png" },
  2: { type: "text", value: "Numbers", textClass: "text-brandBlue" },
  3: { type: "text", value: "Hello", textClass: "text-brandRed" },
  4: { type: "image", value: "/module-assets/cards/module-4.jpg" },
  5: { type: "image", value: "/module-assets/cards/module-5.jpg" },
  6: { type: "image", value: "/module-assets/cards/module-6.jpg" },
  7: { type: "image", value: "/module-assets/cards/module-7.png" },
  8: { type: "image", value: "/module-assets/cards/module-8.png" }
};

export default function ModulesPage() {
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
      <div className="panel panel-lively">
        <h2 className="text-2xl font-semibold title-gradient">Learning Modules</h2>
        <p className="mt-2 text-sm text-muted">Choose a module card to open that module only.</p>
      </div>

      {loading ? <p className="text-sm text-muted">Loading modules...</p> : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const theme = cardTheme(module);
          const cleanedTitle = module.title.replace(/^Module \d+:\s*/i, "");
          const cardMedia =
            MODULE_CARD_MEDIA_BY_ORDER[module.order_index] ?? {
              type: "text",
              value: `Module ${module.order_index}`,
              textClass: "text-brandBlue"
            };

          const cardContent = (
            <article
              className="module-card-live relative h-full overflow-hidden rounded-[28px] border-2 p-4 shadow-soft transition duration-300 hover:-translate-y-1.5 hover:shadow-xl"
              style={{ background: theme.shellBg, borderColor: theme.borderColor }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-85"
                style={{ background: theme.overlayBg }}
              />

              <div
                className="relative h-52 rounded-[22px] border-2 shadow-inner"
                style={{ background: theme.mediaBg, borderColor: "rgba(255,255,255,0.75)" }}
              >
                {cardMedia.type === "image" ? (
                  <img
                    alt={`Module ${module.order_index} preview`}
                    className="h-full w-full rounded-[20px] bg-white object-contain object-center p-2"
                    loading="lazy"
                    src={cardMedia.value}
                  />
                ) : (
                  <div className={`card-hand flex h-full items-center justify-center px-4 text-center text-6xl font-black tracking-tight ${cardMedia.textClass ?? "text-brandBlue"}`}>
                    {cardMedia.value}
                  </div>
                )}
              </div>

              <div className="relative mt-4 flex items-start justify-between gap-2">
                <h3 className="text-3xl font-black leading-tight text-slate-900">
                  Module {module.order_index}: {cleanedTitle}
                </h3>
              </div>

              <div className="relative mt-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Open module details
                </p>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${theme.chipClass}`}>
                  Tap
                </span>
              </div>
            </article>
          );

          return (
            <Link className="block h-full focus-visible:outline-none" key={module.id} href={`/modules/${module.id}`}>
              {cardContent}
            </Link>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
    </section>
  );
}
