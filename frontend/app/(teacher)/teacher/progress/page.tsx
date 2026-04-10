"use client";

import Link from "next/link";

export default function TeacherProgressPage() {
  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
          Teacher Progress
        </p>
        <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
          Review teacher attention and module risk from focused workspaces.
        </h2>
        <p className="teacher-panel-copy mt-3 max-w-3xl text-sm leading-relaxed">
          Student attention alerts now live in Class Management beside roster and handling controls.
          Module weak-item alerts now live in Modules for module-level follow-up.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
            Students Needing Attention
          </p>
          <p className="teacher-card-copy mt-3 text-sm">
            Open Class Management to review flagged students and jump directly into student records.
          </p>
          <Link
            className="mt-4 inline-flex rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
            href="/teacher/class-management"
          >
            Open Class Management
          </Link>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
            Modules That Need Attention
          </p>
          <p className="teacher-card-copy mt-3 text-sm">
            Open Modules to review weak items, affected modules, and full weak-item details.
          </p>
          <Link
            className="mt-4 inline-flex rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
            href="/teacher/modules"
          >
            Open Modules
          </Link>
        </div>
      </div>
    </section>
  );
}
