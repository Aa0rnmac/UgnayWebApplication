import Link from "next/link";

export function StudentHome() {
  return (
    <section className="space-y-6">
      <div className="panel">
        <h2 className="text-2xl font-semibold">Student Dashboard</h2>
        <p className="mt-2 text-sm text-muted">
          Continue your Filipino Sign Language practice with guided modules and the signing lab.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <p className="text-xs uppercase tracking-wider text-muted">Module 1</p>
          <p className="mt-2 text-2xl font-bold text-accent">FSL Alphabets</p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-wider text-muted">Module 2</p>
          <p className="mt-2 text-2xl font-bold text-accentWarm">Numbers</p>
        </div>
        <div className="panel">
          <p className="text-xs uppercase tracking-wider text-muted">Module 3</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">Common Words</p>
        </div>
      </div>

      <div className="panel">
        <p className="text-xs uppercase tracking-wider text-muted">Quick Access</p>
        <div className="mt-3 flex gap-2">
          <Link className="rounded bg-accent px-3 py-2 text-xs font-semibold text-white" href="/student/modules">
            Open Modules
          </Link>
          <Link className="rounded bg-accentWarm px-3 py-2 text-xs font-semibold text-black" href="/student/lab">
            Open Lab
          </Link>
        </div>
      </div>
    </section>
  );
}
