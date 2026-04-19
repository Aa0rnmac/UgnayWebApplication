"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAdminDashboard, type AdminDashboard } from "@/lib/api";

type PieSlice = {
  label: string;
  value: number;
  color: string;
};

function PieGraphCard({
  title,
  subtitle,
  slices,
}: {
  title: string;
  subtitle: string;
  slices: PieSlice[];
}) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  let progress = 0;
  const stops = slices.map((slice) => {
    const safeValue = Math.max(0, slice.value);
    const size = total > 0 ? (safeValue / total) * 360 : 0;
    const start = progress;
    progress += size;
    return `${slice.color} ${start}deg ${progress}deg`;
  });
  const pieBackground = stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#e2e8f0 0deg 360deg)";

  return (
    <div className="panel">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">{title}</p>
      <p className="mt-2 mb-4 text-sm text-slate-700">{subtitle}</p>
      <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
        <div className="flex justify-center">
          <div
            className="relative h-40 w-40 rounded-full border border-brandBorder shadow-inner"
            style={{ background: pieBackground }}
          >
            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-brandBorder bg-white text-xs font-bold text-slate-700">
              {total}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {slices.map((slice) => {
            return (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brandBorder bg-white px-3 py-2 text-sm" key={slice.label}>
                <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                  {slice.label}
                </span>
                <span className="text-slate-600">{slice.value}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminDashboard().then(setDashboard).catch((requestError: Error) => setError(requestError.message));
  }, []);

  const totalStudents = dashboard?.total_students ?? 0;
  const totalTeachers = dashboard?.total_teachers ?? 0;
  const totalSections = dashboard?.total_sections ?? 0;
  const activeSections = dashboard?.active_sections ?? 0;
  const archivedSections = Math.max(totalSections - activeSections, 0);

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin Dashboard</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">System Overview</h2>
        <p className="mt-2 text-sm text-slate-700">
          Quick Access To Create accounts, manage batches, and monitor system activity.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Students", value: dashboard?.total_students ?? 0, tone: "text-brandBlue" },
          { label: "Teachers", value: dashboard?.total_teachers ?? 0, tone: "text-brandGreen" },
          { label: "Batches", value: dashboard?.total_sections ?? 0, tone: "text-accentWarm" },
          { label: "Active Batches", value: dashboard?.active_sections ?? 0, tone: "text-brandBlue" }
        ].map((card) => (
          <div key={card.label} className="panel panel-lively">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">{card.label}</p>
            <p className={`mt-3 text-4xl font-black ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PieGraphCard
          slices={[
            { label: "Students", value: totalStudents, color: "#2946ad" },
            { label: "Teachers", value: totalTeachers, color: "#1f8a4c" },
          ]}
          subtitle="Number of students and teachers."
          title="Students and Teachers"
        />

        <PieGraphCard
          slices={[
            { label: "Active Batches", value: activeSections, color: "#1f8a4c" },
            { label: "Archived Batches", value: archivedSections, color: "#e05a5a" },
          ]}
          subtitle="Batch status summary."
          title="Batch Status"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Recent Accounts</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Latest users in the LMS</h3>
            </div>
            <Link className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" href="/admin/accounts">
              Manage Accounts
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-2 py-3">Username</th>
                  <th className="px-2 py-3">Role</th>
                  <th className="px-2 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.recent_accounts ?? []).map((user) => (
                  <tr className="border-b border-brandBorder/70" key={user.id}>
                    <td className="px-2 py-3 font-semibold text-slate-900">{user.username}</td>
                    <td className="px-2 py-3 capitalize text-slate-700">{user.role}</td>
                    <td className="px-2 py-3 text-slate-600">{new Date(user.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Quick Actions</p>
          
          <div className="mt-4 grid gap-3">
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/accounts">
              Bulk create student, teacher, and admin accounts
            </Link>
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/sections">
              Create batches and assign students
            </Link>
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/reports">
              View system audit logs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
