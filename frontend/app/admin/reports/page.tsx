"use client";

import { useEffect, useState } from "react";

import { getAdminAuditEvents, getAdminLoginActivityReport, type AdminAuditEvent, type LoginActivityReport } from "@/lib/api";

export default function AdminReportsPage() {
  const [loginReport, setLoginReport] = useState<LoginActivityReport | null>(null);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAdminLoginActivityReport(120), getAdminAuditEvents(120)])
      .then(([loginData, auditData]) => {
        setLoginReport(loginData);
        setAuditEvents(auditData);
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Reports and Login Activity</h2>
        <p className="mt-2 text-sm text-slate-700">
          Monitor login sessions, account usage, and admin actions in one screen.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Logins (24h)</p>
          <p className="mt-3 text-4xl font-black text-brandBlue">{loginReport?.total_logins_last_24h ?? 0}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Active Sessions</p>
          <p className="mt-3 text-4xl font-black text-brandGreen">{loginReport?.active_sessions ?? 0}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Teacher Logins (24h)</p>
          <p className="mt-3 text-4xl font-black text-accentWarm">
            {loginReport?.logins_last_24h_by_role?.teacher ?? 0}
          </p>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Recent Login Sessions</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-2 py-3">User</th>
                  <th className="px-2 py-3">Role</th>
                  <th className="px-2 py-3">Login Time</th>
                  <th className="px-2 py-3">Session</th>
                </tr>
              </thead>
              <tbody>
                {(loginReport?.events ?? []).map((event) => (
                  <tr className="border-b border-brandBorder/70" key={event.session_id}>
                    <td className="px-2 py-3 font-semibold text-slate-900">{event.username}</td>
                    <td className="px-2 py-3 capitalize text-slate-700">{event.role}</td>
                    <td className="px-2 py-3 text-slate-700">{new Date(event.logged_in_at).toLocaleString()}</td>
                    <td className="px-2 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.is_active ? "bg-brandGreenLight text-brandGreen" : "bg-brandMutedSurface text-slate-600"}`}>
                        {event.is_active ? "Active" : "Expired"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Admin Action Trail</p>
          <div className="mt-4 space-y-3">
            {auditEvents.map((event) => (
              <article className="rounded-xl border border-brandBorder bg-white px-3 py-3" key={event.id}>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{event.action_type.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-slate-600">Admin: {event.admin_username}</p>
                <p className="text-xs text-slate-600">Target: {event.target_type} {event.target_id ?? "-"}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
