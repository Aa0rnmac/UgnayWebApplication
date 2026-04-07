import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";

const PROGRESS_CARDS = [
  {
    eyebrow: "Support Queue",
    title: "7 Need Intervention",
    description: "Learners in this lane need guided repetition, shorter feedback loops, and fast follow-up.",
    badge: "SUP",
    ctaLabel: "Review Support Queue",
  },
  {
    eyebrow: "Steady Growth",
    title: "18 On Track",
    description: "These learners are moving well through the current sequence and can take on the next checkpoint.",
    badge: "OK",
    ctaLabel: "Check Cohort Trends",
  },
  {
    eyebrow: "Assessment Ready",
    title: "9 Ready To Test",
    description: "This group is ready for a stronger evaluation pass on signs, pacing, and retention.",
    badge: "A+",
    ctaLabel: "Open Assessment View",
  },
];

const INTERVENTIONS = [
  {
    learner: "Section A - Group 2",
    note: "Needs another pass on numbers 11-20 with slower pacing and clearer motion emphasis.",
  },
  {
    learner: "Section B - Pair 4",
    note: "Strong recall, but accuracy drops during mixed-speed practice. Add focused repetition before retest.",
  },
  {
    learner: "Section C - Group 1",
    note: "Common words are improving; next step is confidence-building through short expressive signing drills.",
  },
];

export default function TeacherProgressPage() {
  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">Learner Progress</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">Turn progress tracking into something visual, fast, and impossible to miss.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          The teacher progress screen now follows the student-side visual tone, but tuned for coaching, assessment readiness, and intervention work.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {PROGRESS_CARDS.map((card, index) => (
          <TeacherWorkspaceCard key={card.title} themeIndex={index} {...card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">Cohort Pulse</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Completion</p>
              <p className="mt-2 text-3xl font-black text-accentWarm">76%</p>
              <p className="mt-2 text-xs text-slate-300">Healthy movement through current lessons with room to tighten the final checkpoint.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Accuracy Trend</p>
              <p className="mt-2 text-3xl font-black text-brandGreen">+12%</p>
              <p className="mt-2 text-xs text-slate-300">Recent practice sets show stronger consistency in alphabets and daily words.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Needs Review</p>
              <p className="mt-2 text-3xl font-black text-accent">5 Groups</p>
              <p className="mt-2 text-xs text-slate-300">Most of the pressure is centered around paced number recognition and retention.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Next Action</p>
              <p className="mt-2 text-3xl font-black text-brandBlue">Coach</p>
              <p className="mt-2 text-xs text-slate-300">Run short intervention blocks before the next formal assessment round.</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Intervention Queue</p>
          <div className="mt-4 space-y-3">
            {INTERVENTIONS.map((item, index) => (
              <div key={item.learner} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-black text-brandWhite">{item.learner}</p>
                  <span className="rounded-full bg-accent/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accentWarm">
                    Priority 0{index + 1}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
