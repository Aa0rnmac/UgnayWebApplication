import Link from "next/link";

import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";

const OVERVIEW_CARDS = [
  {
    eyebrow: "Class Pulse",
    title: "4 Active Sections",
    description: "Track daily attendance, quick announcements, and section health from one teacher view.",
    badge: "CLS",
    href: "/teacher/classes",
    ctaLabel: "Open Class Overview",
  },
  {
    eyebrow: "Content Flow",
    title: "12 Published Modules",
    description: "Draft, sequence, and refresh lesson pacing with the same bold navigation language as the student side.",
    badge: "MOD",
    href: "/teacher/modules",
    ctaLabel: "Open Module Management",
  },
  {
    eyebrow: "Intervention",
    title: "7 Learners Need Support",
    description: "Spot stalled progress, coaching opportunities, and follow-up actions before learners fall behind.",
    badge: "PRG",
    href: "/teacher/progress",
    ctaLabel: "Open Learner Progress",
  },
];

const WEEKLY_FOCUS = [
  "Check sections with low completion after the latest alphabet activity.",
  "Refresh module pacing before the next signed-number quiz block.",
  "Queue short intervention practice for learners under the passing threshold.",
];

const WORKFLOW_STEPS = [
  { label: "Review", detail: "Scan section health and learner movement at a glance." },
  { label: "Adjust", detail: "Reorder lessons or add extra practice where progress dips." },
  { label: "Support", detail: "Follow up with the students who need targeted coaching." },
];

export function TeacherHome() {
  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">Teacher Workspace</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">Guide the class with the same bold rhythm students already feel.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              This workspace now mirrors the student-side visual energy with stronger cards, bright accents, and clearer next actions for classroom management.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white" href="/teacher/classes">
              Class Overview
            </Link>
            <Link className="rounded-full bg-accentWarm px-4 py-2 text-xs font-semibold text-black" href="/teacher/modules">
              Module Management
            </Link>
            <Link className="rounded-full bg-brandGreen px-4 py-2 text-xs font-semibold text-white" href="/teacher/progress">
              Learner Progress
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {OVERVIEW_CARDS.map((card, index) => (
          <TeacherWorkspaceCard key={card.title} themeIndex={index} {...card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">Weekly Focus</p>
          <div className="mt-4 space-y-3">
            {WEEKLY_FOCUS.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-white">
                  {index + 1}
                </div>
                <p className="text-sm leading-relaxed text-slate-200">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">Teacher Flow</p>
          <div className="mt-4 space-y-3">
            {WORKFLOW_STEPS.map((step, index) => (
              <div key={step.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black text-brandWhite">
                  0{index + 1}. {step.label}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
