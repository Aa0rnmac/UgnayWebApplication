"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getAdminSystemActivityEvents,
  type SystemActivityEvent
} from "@/lib/api";

type RoleFilter = "all" | "student" | "teacher" | "admin";

function resolveActorCompany(event: SystemActivityEvent): string {
  const company = event.actor_company_name?.trim();
  if (company) {
    return company;
  }
  if (event.actor_role === "teacher" || event.actor_role === "admin") {
    return "HAND AND HEART";
  }
  return "-";
}

function formatActionType(value: string): string {
  if (value === "teacher_module_deleted") {
    return "deleted module";
  }
  if (value === "global_certificate_template_updated") {
    return "certificate template updated";
  }
  return value.replaceAll("_", " ");
}

function toStartOfDayTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(`${trimmed}T00:00:00`);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toEndOfDayTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(`${trimmed}T23:59:59.999`);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function AdminReportsPage() {
  const [activityEvents, setActivityEvents] = useState<SystemActivityEvent[]>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSystemActivityEvents(400, "all")
      .then(setActivityEvents)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const event of activityEvents) {
      const company = resolveActorCompany(event);
      if (company !== "-") {
        set.add(company);
      }
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [activityEvents]);

  const actionTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const event of activityEvents) {
      const actionType = event.action_type?.trim();
      if (actionType) {
        set.add(actionType);
      }
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [activityEvents]);

  const dateFromTimestamp = useMemo(() => toStartOfDayTimestamp(dateFrom), [dateFrom]);
  const dateToTimestamp = useMemo(() => toEndOfDayTimestamp(dateTo), [dateTo]);

  const filteredActivityEvents = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return activityEvents.filter((event) => {
      const roleOk = roleFilter === "all" || event.actor_role === roleFilter;
      if (!roleOk) {
        return false;
      }
      const company = resolveActorCompany(event);
      if (companyFilter !== "all" && company !== companyFilter) {
        return false;
      }
      if (actionTypeFilter !== "all" && event.action_type !== actionTypeFilter) {
        return false;
      }
      const eventTimestamp = new Date(event.created_at).getTime();
      if (dateFromTimestamp !== null && eventTimestamp < dateFromTimestamp) {
        return false;
      }
      if (dateToTimestamp !== null && eventTimestamp > dateToTimestamp) {
        return false;
      }
      if (searchTerm) {
        const haystack = [
          event.actor_username,
          event.actor_email ?? "",
          event.actor_first_name ?? "",
          event.actor_last_name ?? "",
          resolveActorCompany(event),
          formatActionType(event.action_type),
          event.target_type ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });
  }, [actionTypeFilter, activityEvents, companyFilter, dateFromTimestamp, dateToTimestamp, roleFilter, search]);

  const passwordChangeCount = useMemo(
    () =>
      filteredActivityEvents.filter((event) => event.action_type === "account_password_changed")
        .length,
    [filteredActivityEvents]
  );

  return (
    <section className="space-y-6">
      <div className="panel">
        <h2 className="text-3xl font-bold title-gradient">Audit Logs</h2>
        <p className="mt-2 text-sm text-slate-700">
          Track system actions.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Audit Entries</p>
          <p className="mt-3 text-4xl font-black text-brandBlue">{filteredActivityEvents.length}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Password Changes</p>
          <p className="mt-3 text-4xl font-black text-brandGreen">{passwordChangeCount}</p>
        </article>
        <article className="panel panel-lively">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Teachers</p>
          <p className="mt-3 text-4xl font-black text-accentWarm">
            {filteredActivityEvents.filter((event) => event.actor_role === "teacher").length}
          </p>
        </article>
      </div>

      <div className="panel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-semibold text-slate-800">
            Search
            <input
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search user, email, action, company..."
              type="text"
              value={search}
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Date From
            <input
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              type="date"
              value={dateFrom}
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Date To
            <input
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              type="date"
              value={dateTo}
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Role Filter
            <select
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              value={roleFilter}
            >
              <option value="all">All Roles</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Action Type
            <select
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setActionTypeFilter(event.target.value)}
              value={actionTypeFilter}
            >
              <option value="all">All Actions</option>
              {actionTypeOptions.map((actionType) => (
                <option key={actionType} value={actionType}>
                  {formatActionType(actionType)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Company Filter
            <select
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              onChange={(event) => setCompanyFilter(event.target.value)}
              value={companyFilter}
            >
              <option value="all">All Companies</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-brandBlueLight"
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setRoleFilter("all");
                setActionTypeFilter("all");
                setCompanyFilter("all");
              }}
              type="button"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">System Audit Trail</p>
          <span className="rounded-full border border-brandBorder bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            {filteredActivityEvents.length} entries
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                <th className="px-2 py-3">Time</th>
                <th className="px-2 py-3">Role</th>
                <th className="px-2 py-3">Email</th>
                <th className="px-2 py-3">First Name</th>
                <th className="px-2 py-3">Last Name</th>
                <th className="px-2 py-3">Company</th>
                <th className="px-2 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivityEvents.map((event) => (
                <tr className="border-b border-brandBorder/70" key={event.id}>
                  <td className="px-2 py-3 text-slate-700">{new Date(event.created_at).toLocaleString()}</td>
                  <td className="px-2 py-3 capitalize text-slate-700">{event.actor_role}</td>
                  <td className="px-2 py-3 text-slate-700">{event.actor_email ?? "-"}</td>
                  <td className="px-2 py-3 text-slate-700">{event.actor_first_name ?? "-"}</td>
                  <td className="px-2 py-3 text-slate-700">{event.actor_last_name ?? "-"}</td>
                  <td className="px-2 py-3 text-slate-700">{resolveActorCompany(event)}</td>
                  <td className="px-2 py-3 font-semibold text-slate-900">
                    {formatActionType(event.action_type)}
                  </td>
                </tr>
              ))}
              {filteredActivityEvents.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={7}>
                    No audit entries found for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
