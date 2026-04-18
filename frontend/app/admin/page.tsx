"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAdminDashboard, type AdminDashboard } from "@/lib/api";

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminDashboard().then(setDashboard).catch((requestError: Error) => setError(requestError.message));
  }, []);

  const totalStudents = dashboard?.total_students ?? 0;
  const totalTeachers = dashboard?.total_teachers ?? 0;
  const totalUsers = totalStudents + totalTeachers;
  const totalSections = dashboard?.total_sections ?? 0;
  const activeSections = dashboard?.active_sections ?? 0;
  const archivedSections = Math.max(totalSections - activeSections, 0);
  const studentShare = totalUsers > 0 ? Math.round((totalStudents / totalUsers) * 100) : 0;
  const teacherShare = totalUsers > 0 ? 100 - studentShare : 0;
  const activeSectionShare = totalSections > 0 ? Math.round((activeSections / totalSections) * 100) : 0;
  const archivedSectionShare = totalSections > 0 ? 100 - activeSectionShare : 0;
  const recentRoleCounts = (dashboard?.recent_accounts ?? []).reduce(
    (acc, account) => {
      if (account.role === "teacher") {
        acc.teachers += 1;
      } else if (account.role === "student") {
        acc.students += 1;
      } else if (account.role === "admin") {
        acc.admins += 1;
      }
      return acc;
    },
    { students: 0, teachers: 0, admins: 0 }
  );

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin Dashboard</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">System Overview</h2>
        <p className="mt-2 text-sm text-slate-700">
          Quick Access Too Create accounts, manage sections, and monitor system activity.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Students", value: dashboard?.total_students ?? 0, tone: "text-brandBlue" },
          { label: "Teachers", value: dashboard?.total_teachers ?? 0, tone: "text-brandGreen" },
          { label: "Sections", value: dashboard?.total_sections ?? 0, tone: "text-accentWarm" },
          { label: "Active Sections", value: dashboard?.active_sections ?? 0, tone: "text-brandBlue" }
        ].map((card) => (
          <div key={card.label} className="panel panel-lively">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">{card.label}</p>
            <p className={`mt-3 text-4xl font-black ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Quick Graph - User Mix</p>
          <p className="mt-2 mb-4 text-sm text-slate-700">Simple view for non-tech users: how many students vs teachers.</p>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">Students</span>
                <span className="text-slate-600">{totalStudents} ({studentShare}%)</span>
              </div>
              <div className="h-2 rounded-full bg-brandBlueLight">
                <div className="h-full rounded-full bg-brandBlue" style={{ width: `${studentShare}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">Teachers</span>
                <span className="text-slate-600">{totalTeachers} ({teacherShare}%)</span>
              </div>
              <div className="h-2 rounded-full bg-brandGreenLight">
                <div className="h-full rounded-full bg-brandGreen" style={{ width: `${teacherShare}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Quick Graph - Section Status</p>
          <p className="mt-2 mb-4 text-sm text-slate-700">At-a-glance section availability across the LMS.</p>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">Active Sections</span>
                <span className="text-slate-600">{activeSections} ({activeSectionShare}%)</span>
              </div>
              <div className="h-2 rounded-full bg-brandGreenLight">
                <div className="h-full rounded-full bg-brandGreen" style={{ width: `${activeSectionShare}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">Archived Sections</span>
                <span className="text-slate-600">{archivedSections} ({archivedSectionShare}%)</span>
              </div>
              <div className="h-2 rounded-full bg-brandRedLight">
                <div className="h-full rounded-full bg-brandRed" style={{ width: `${archivedSectionShare}%` }} />
              </div>
            </div>
          </div>
          <p className="mt-4 mb-0 rounded-xl border border-brandRed/30 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed">
            NOTE: Keep instructions short and direct for easier admin operations.
          </p>
        </div>
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
          <div className="mt-3 mb-3 rounded-xl border border-brandBlue/30 bg-brandBlueLight px-3 py-2 text-xs font-semibold text-brandBlue">
            NEW ACCOUNT SNAPSHOT: {recentRoleCounts.students} students, {recentRoleCounts.teachers} teachers, {recentRoleCounts.admins} admins in the latest account batch.
          </div>
          <div className="mt-4 grid gap-3">
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/accounts">
              Bulk create student and teacher accounts
            </Link>
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/sections">
              Create sections and assign students
            </Link>
            <Link className="rounded-xl border border-brandBorder bg-white px-4 py-4 font-semibold text-brandBlue transition hover:bg-brandBlueLight" href="/admin/reports">
              View login activity and system audit logs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
