import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";

const CLASS_CARDS = [
  {
    eyebrow: "Morning Block",
    title: "Section A",
    description: "High participation and steady module completion, with a few learners needing extra practice before assessment.",
    badge: "A1",
    ctaLabel: "Review Roster",
  },
  {
    eyebrow: "Midday Block",
    title: "Section B",
    description: "Strong momentum in alphabets and words, but number pacing still needs a tighter coaching loop.",
    badge: "B2",
    ctaLabel: "View Snapshot",
  },
  {
    eyebrow: "Afternoon Block",
    title: "Section C",
    description: "Improving engagement and better consistency after shorter guided drills in the lab sequence.",
    badge: "C3",
    ctaLabel: "Check Attendance",
  },
];

const ROSTER_NOTES = [
  {
    title: "Attendance Watch",
    detail: "One section dipped this week; keep the next lesson compact so returning learners can re-enter smoothly.",
  },
  {
    title: "Practice Energy",
    detail: "Students respond best when class review alternates between fast recall and slower handshape correction.",
  },
  {
    title: "Support Window",
    detail: "Reserve a short catch-up block after the next quiz for learners still struggling with number movement patterns.",
  },
];

export default function TeacherClassesPage() {
  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Class Overview</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-brandWhite">Give class management the same visual confidence as the student learning cards.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          The class view now uses the same bright, rounded, high-contrast language so roster review feels like part of the product, not a disconnected admin shell.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {CLASS_CARDS.map((card, index) => (
          <TeacherWorkspaceCard key={card.title} themeIndex={index} {...card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">Section Snapshot</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-brandWhite">Active Learners</p>
                <span className="text-2xl font-black text-brandWhite">31</span>
              </div>
              <p className="mt-2 text-xs text-slate-300">Stable attendance with better response during shorter guided signing bursts.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-brandWhite">Module Completion</p>
                <span className="text-2xl font-black text-accentWarm">68%</span>
              </div>
              <p className="mt-2 text-xs text-slate-300">Learners are progressing, but the latest module handoff still needs a clearer follow-through.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-brandWhite">Attendance Trend</p>
                <span className="text-2xl font-black text-brandGreen">Up</span>
              </div>
              <p className="mt-2 text-xs text-slate-300">Recent class sessions show stronger return rates after lab-supported practice.</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">Roster Notes</p>
          <div className="mt-4 space-y-3">
            {ROSTER_NOTES.map((note, index) => (
              <div key={note.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black text-brandWhite">
                  {index + 1}. {note.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">{note.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
