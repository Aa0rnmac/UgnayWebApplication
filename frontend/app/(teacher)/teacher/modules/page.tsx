import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";

const MODULE_CARDS = [
  {
    eyebrow: "Build",
    title: "Draft New Lessons",
    description: "Shape new FSL sequences, attach practice prompts, and prepare clean content arcs before release.",
    badge: "NEW",
    ctaLabel: "Start Drafting",
  },
  {
    eyebrow: "Sequence",
    title: "Tune Learning Order",
    description: "Adjust lesson order, checkpoint timing, and reinforcement blocks to match learner readiness.",
    badge: "ORD",
    ctaLabel: "Review Sequence",
  },
  {
    eyebrow: "Publish",
    title: "Prepare Rollout",
    description: "Stage the next module wave with stronger clarity on what students see first, next, and last.",
    badge: "GO",
    ctaLabel: "Open Publish Queue",
  },
];

const MODULE_TRACKS = [
  {
    title: "Alphabet Foundations",
    detail: "Keep the starter sequence compact and highly visual so first-time learners build confidence quickly.",
  },
  {
    title: "Numbers Practice",
    detail: "Use shorter repetitions and clearer checkpoints around dynamic number groups before full assessments.",
  },
  {
    title: "Common Words",
    detail: "Blend recall drills with signed-expression use cases so fluency grows beyond memorization.",
  },
];

export default function TeacherModulesPage() {
  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">Module Management</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">Design the teacher flow with the same vivid feel as the student cards.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          This page now frames module work as a bright workspace instead of a placeholder shell, so planning, sequencing, and publishing feel part of the same product system.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {MODULE_CARDS.map((card, index) => (
          <TeacherWorkspaceCard key={card.title} themeIndex={index} {...card} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Current Teaching Tracks</p>
          <div className="mt-4 space-y-3">
            {MODULE_TRACKS.map((track, index) => (
              <div key={track.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-brandWhite">{track.title}</p>
                  <span className="rounded-full bg-brandBlue/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brandWhite">
                    Lane 0{index + 1}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">{track.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">Publishing Rhythm</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-black text-brandWhite">1. Draft clean lesson chunks</p>
              <p className="mt-2 text-xs text-slate-300">Keep each lesson focused on one clear signing objective and one matching assessment expectation.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-black text-brandWhite">2. Check sequence pressure</p>
              <p className="mt-2 text-xs text-slate-300">Make sure each step raises difficulty gradually instead of stacking too many new motions at once.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-black text-brandWhite">3. Publish with visible intent</p>
              <p className="mt-2 text-xs text-slate-300">Students should feel why a module exists the moment they open its card.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
