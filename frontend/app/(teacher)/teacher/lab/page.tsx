"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  SigningLab,
  type SigningLabTeacherFocus,
} from "@/components/lab/signing-lab";
import type { NumbersCategory, WordsCategory } from "@/lib/api";
import {
  type TeacherLabMode,
  type TeacherLabModeStatus,
  type TeacherLabWorkspaceData,
  type TeacherModulePracticeGuide,
  getTeacherLabData,
} from "@/lib/teacher-data";

type LabExperienceFocus = SigningLabTeacherFocus & {
  mode: TeacherLabMode;
  numbersCategory?: NumbersCategory;
  wordsCategory?: WordsCategory;
};

const WORKFLOW_STEPS = [
  {
    title: "Pick the lane",
    detail: "Choose the recognition lane that matches the lesson or module you want to rehearse.",
  },
  {
    title: "Run a guided check",
    detail: "Open the camera, warm the model, and compare a clean teacher-led attempt before class.",
  },
  {
    title: "Use the result to coach",
    detail: "Review the prediction, confidence, and alternates to decide whether the lane is classroom-ready.",
  },
] as const;

const DEFAULT_FOCUS: LabExperienceFocus = {
  mode: "alphabet",
  title: "Alphabet live check",
  description:
    "Use alphabet mode for quick letter drills, repeated handshape comparisons, and teacher-led practical checks.",
  selectorHint: "Choose Alphabet mode in the lab.",
  prepFocus:
    "Best for rehearsing letter clarity before or after students attempt a practical activity.",
  readiness: "ready",
};

function readinessTone(readiness: "ready" | "attention") {
  return readiness === "ready"
    ? "border-brandGreen/40 bg-brandGreenLight text-brandGreen"
    : "border-brandYellow/40 bg-brandYellowLight text-brandNavy";
}

function modeAccent(mode: TeacherLabMode) {
  if (mode === "numbers") {
    return "text-brandBlue";
  }
  if (mode === "words") {
    return "text-accentWarm";
  }
  return "text-brandGreen";
}

function wordsCategoryFromGuide(guide: TeacherModulePracticeGuide): WordsCategory | undefined {
  switch (guide.labModeLabel) {
    case "Words / Greetings":
      return "greeting";
    case "Words / Family":
      return "family";
    case "Words / Relationship":
      return "relationship";
    case "Words / Date":
      return "date";
    case "Words / Color":
      return "color";
    case "Words / Responses":
      return "responses";
    default:
      return undefined;
  }
}

function focusFromStatus(status: TeacherLabModeStatus): LabExperienceFocus {
  if (status.mode === "numbers") {
    return {
      mode: "numbers",
      title: "Numbers guided check",
      description:
        "Use the numbers lane to compare static digits, test the right number range, and verify that motion-based checks are stable enough for class.",
      selectorHint: status.selectorHint,
      prepFocus:
        "Start with a clean range selection so the teacher is validating the same lane students are expected to use.",
      numbersCategory: "0-10",
      readiness: status.readiness,
    };
  }

  if (status.mode === "words") {
    return {
      mode: "words",
      title: "Words guided check",
      description:
        "Use the words lane to rehearse short sequences, compare common phrase confusions, and verify that the live category is ready for practice.",
      selectorHint: status.selectorHint,
      prepFocus:
        "Match the category first, then compare a clean repeated sequence before relying on the result in class.",
      wordsCategory: "greeting",
      readiness: status.readiness,
    };
  }

  return {
    mode: "alphabet",
    title: "Alphabet live check",
    description:
      "Use alphabet mode for quick letter drills, repeated handshape comparisons, and teacher-led practical checks.",
    selectorHint: status.selectorHint,
    prepFocus:
      "Best for rehearsing letter clarity before or after students attempt a practical activity.",
    readiness: status.readiness,
  };
}

function focusFromGuide(guide: TeacherModulePracticeGuide): LabExperienceFocus {
  return {
    mode: guide.labMode,
    title: guide.moduleTitle,
    description: `${guide.labModeLabel} lane recommended for this module. ${guide.prepFocus}`,
    selectorHint: guide.selectorHint,
    prepFocus: guide.prepFocus,
    numbersCategory: guide.labMode === "numbers" ? "0-10" : undefined,
    wordsCategory: guide.labMode === "words" ? wordsCategoryFromGuide(guide) : undefined,
  };
}

function focusMatchesGuide(focus: LabExperienceFocus, guide: TeacherModulePracticeGuide) {
  if (guide.labMode !== focus.mode) {
    return false;
  }

  if (focus.mode !== "words" || !focus.wordsCategory) {
    return true;
  }

  const guideCategory = wordsCategoryFromGuide(guide);
  return guideCategory ? guideCategory === focus.wordsCategory : true;
}

function enrichFocus(
  focus: LabExperienceFocus,
  data: TeacherLabWorkspaceData | null
): LabExperienceFocus {
  const status = data?.statuses.find((item) => item.mode === focus.mode);
  if (!status) {
    return focus;
  }
  return {
    ...focus,
    readiness: status.readiness,
  };
}

function recommendedFocus(data: TeacherLabWorkspaceData): LabExperienceFocus {
  const selectedStatus =
    data.statuses.find((status) => status.readiness === "attention") ?? data.statuses[0];
  return selectedStatus ? focusFromStatus(selectedStatus) : DEFAULT_FOCUS;
}

export default function TeacherLabPage() {
  const [data, setData] = useState<TeacherLabWorkspaceData | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [labFocus, setLabFocus] = useState<LabExperienceFocus>(DEFAULT_FOCUS);
  const [manualFocus, setManualFocus] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getTeacherLabData()
      .then(setData)
      .catch((requestError: Error) => setPageError(requestError.message));
  }, []);

  useEffect(() => {
    if (!data || manualFocus) {
      return;
    }
    setLabFocus(recommendedFocus(data));
  }, [data, manualFocus]);

  const attentionStatuses = useMemo(
    () => data?.statuses.filter((status) => status.readiness === "attention") ?? [],
    [data]
  );

  const selectedStatus = useMemo(
    () => data?.statuses.find((status) => status.mode === labFocus.mode) ?? null,
    [data, labFocus.mode]
  );

  const guideMatches = useMemo(() => {
    if (!data) {
      return [];
    }

    const matchingGuides = data.guides.filter((guide) => focusMatchesGuide(labFocus, guide));
    if (matchingGuides.length > 0) {
      return matchingGuides;
    }

    return data.guides.filter((guide) => guide.labMode === labFocus.mode);
  }, [data, labFocus]);

  const nextMoveCopy = attentionStatuses.length
    ? `Start with ${attentionStatuses[0].title}. This lane still needs teacher-guided caution before it becomes an everyday classroom default.`
    : "All shared lab lanes are ready. Pick the module or lane you want to rehearse and run one clean teacher-led check.";

  function activateFocus(
    focus: LabExperienceFocus,
    options?: { scroll?: boolean; userTriggered?: boolean }
  ) {
    setLabFocus(enrichFocus(focus, data));
    if (options?.userTriggered) {
      setManualFocus(true);
    }
    if (options?.scroll) {
      window.requestAnimationFrame(() => {
        workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              Teacher Lab
            </p>
            <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
              Rehearse the live recognition flow before you use it in class.
            </h2>
            <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
              This workspace now guides teachers from readiness review into the exact lane and
              module mapping they need, then drops them into a focused live check surface.
            </p>

            <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5">
              <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                Recommended Next Move
              </p>
              <p className="teacher-card-copy mt-3 text-sm leading-relaxed">{nextMoveCopy}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brandBlue/90"
                  onClick={() => activateFocus(data ? recommendedFocus(data) : DEFAULT_FOCUS, { scroll: true })}
                  type="button"
                >
                  Start Recommended Check
                </button>
                <span className="rounded-full border border-brandBorder bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
                  Selected lane: {labFocus.title}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
              Teacher Flow
            </p>
            <div className="mt-4 space-y-3">
              {WORKFLOW_STEPS.map((step, index) => (
                <div key={step.title} className="rounded-2xl border border-white/10 bg-white/55 p-4">
                  <p className="teacher-card-title text-sm font-black">
                    0{index + 1}. {step.title}
                  </p>
                  <p className="teacher-card-copy mt-2 text-sm leading-relaxed">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Modes Ready
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {data ? `${data.summary.readyModes}/3` : "0/3"}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Recognition lanes currently stable enough for guided teacher practice.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Needs Caution
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {data?.summary.attentionModes ?? 0}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Lanes that should stay teacher-led until readiness improves.
          </p>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">
            Module Guides
          </p>
          <p className="teacher-panel-value mt-3 text-4xl font-black">
            {data?.summary.guidedModules ?? 0}
          </p>
          <p className="teacher-panel-copy mt-2 text-sm">
            Teacher-visible modules already mapped to their best lab setup.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
                Choose Practice Lane
              </p>
              <h3 className="teacher-panel-heading mt-2 text-2xl font-black leading-tight">
                Start from the lane you want to verify.
              </h3>
            </div>
            <span className="rounded-full border border-brandBorder bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
              Focus: {labFocus.mode}
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {data?.statuses.map((status) => {
              const active = labFocus.mode === status.mode;

              return (
                <button
                  key={status.mode}
                  className={`rounded-3xl border p-5 text-left transition ${
                    active
                      ? "border-brandBlue/30 bg-brandBlue/10 shadow-soft"
                      : "border-white/10 bg-black/20 hover:-translate-y-0.5 hover:border-brandBlue/30"
                  }`}
                  onClick={() => activateFocus(focusFromStatus(status), { userTriggered: true })}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${modeAccent(status.mode)}`}>
                        {status.title}
                      </p>
                      <p className="teacher-card-copy mt-2 text-sm leading-relaxed">{status.summary}</p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${readinessTone(status.readiness)}`}
                    >
                      {active ? "selected" : status.readiness}
                    </span>
                  </div>

                  <p className="teacher-card-copy mt-4 text-sm leading-relaxed">{status.detail}</p>
                  <p className="teacher-card-meta mt-4 text-xs">{status.selectorHint}</p>
                </button>
              );
            }) ?? (
              <div className="teacher-card-copy rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                Loading shared lab readiness...
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
            Teacher Playbook
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-title text-sm font-black">{labFocus.title}</p>
              <p className="teacher-card-copy mt-2 text-sm leading-relaxed">
                {labFocus.description}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-title text-sm font-black">Best practice</p>
              <p className="teacher-card-copy mt-2 text-sm leading-relaxed">
                {labFocus.prepFocus}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-title text-sm font-black">
                {selectedStatus?.readiness === "attention"
                  ? "Keep this lane teacher-guided"
                  : "Lane ready for guided classroom use"}
              </p>
              <p className="teacher-card-copy mt-2 text-sm leading-relaxed">
                {selectedStatus?.detail ??
                  "Select a lane to see the latest readiness notes for that recognition mode."}
              </p>
              <p className="teacher-card-meta mt-2 text-xs">
                Standard practice: compare one clean attempt before relying on the live result
                during class.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">
              Mapped Module Guides
            </p>
            <h3 className="teacher-panel-heading mt-2 text-2xl font-black leading-tight">
              Use the module-to-lab mapping to jump into the right setup.
            </h3>
          </div>
          <span className="rounded-full border border-brandBorder bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
            Showing {guideMatches.length} guide{guideMatches.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {guideMatches.length ? (
            guideMatches.map((guide) => (
              <button
                key={guide.moduleId}
                className="rounded-3xl border border-white/10 bg-black/20 p-5 text-left transition hover:-translate-y-0.5 hover:border-brandBlue/30"
                onClick={() => activateFocus(focusFromGuide(guide), { scroll: true, userTriggered: true })}
                type="button"
              >
                <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${modeAccent(guide.labMode)}`}>
                  {guide.labModeLabel}
                </p>
                <p className="teacher-card-title mt-3 text-lg font-black">{guide.moduleTitle}</p>
                <p className="teacher-card-copy mt-3 text-sm leading-relaxed">{guide.prepFocus}</p>
                <p className="teacher-card-meta mt-4 text-xs">{guide.selectorHint}</p>
                <span className="mt-4 inline-flex rounded-full border border-brandBorder bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
                  Use this setup
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-title text-sm font-black">No guide match yet.</p>
              <p className="teacher-card-copy mt-2 text-sm">
                Change the selected lane above to see module guides for another recognition path.
              </p>
            </div>
          )}
        </div>
      </div>

      <div ref={workspaceRef}>
        <SigningLab
          preferredMode={labFocus.mode}
          preferredNumbersCategory={labFocus.numbersCategory}
          preferredWordsCategory={labFocus.wordsCategory}
          teacherFocus={enrichFocus(labFocus, data)}
          variant="teacher"
        />
      </div>

      {pageError ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {pageError}</p>
        </div>
      ) : null}
    </section>
  );
}
