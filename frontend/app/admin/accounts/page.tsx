"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  archiveTeacherAccount,
  bulkImportAccounts,
  getAdminSections,
  getAdminUsers,
  resendCredentials,
  unarchiveStudentAccount,
  type AdminUser,
  type BulkAccountImportJob,
  type LmsSection
} from "@/lib/api";

function parseRows(source: string, defaultSectionId: number | null) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email = "", first_name = "", last_name = "", sectionIdValue = ""] = line.split(",").map((part) => part.trim());
      return {
        email,
        first_name: first_name || undefined,
        last_name: last_name || undefined,
        section_id: sectionIdValue ? Number(sectionIdValue) : defaultSectionId,
      };
    })
    .filter((row) => row.email);
}

export default function AdminAccountsPage() {
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [rawRows, setRawRows] = useState("");
  const [sections, setSections] = useState<LmsSection[]>([]);
  const [defaultSectionId, setDefaultSectionId] = useState<string>("");
  const [batchSize, setBatchSize] = useState(25);
  const [result, setResult] = useState<BulkAccountImportJob | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parsedRows = useMemo(
    () => parseRows(rawRows, defaultSectionId ? Number(defaultSectionId) : null),
    [defaultSectionId, rawRows]
  );

  async function refreshUsers(currentRole: "student" | "teacher" | "admin" = role) {
    const data = await getAdminUsers(currentRole, { includeArchived: currentRole === "student" || currentRole === "teacher" });
    setUsers(data);
  }

  useEffect(() => {
    getAdminSections().then(setSections).catch(() => undefined);
    void refreshUsers(role);
  }, [role]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await bulkImportAccounts({
        role,
        batch_size: batchSize,
        accounts: parsedRows,
      });
      setResult(response);
      setRawRows("");
      await refreshUsers(role);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to import accounts.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Bulk Account Creation</h2>
        <p className="mt-2 text-sm text-slate-700">
          Paste one account per line using this format: <code>email,first name,last name,section id</code>.
        </p>
      </div>

      <form className="panel space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-800">
            Role
            <select className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setRole(event.target.value as "student" | "teacher")} value={role}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-800">
            Default Section
            <select className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setDefaultSectionId(event.target.value)} value={defaultSectionId}>
              <option value="">No default section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-brandBorder bg-brandBlueLight px-4 py-3 text-sm text-slate-700">
            Parsed rows: <span className="font-bold text-brandBlue">{parsedRows.length}</span>
          </div>
          <label className="text-sm font-semibold text-slate-800">
            Email Batch Size
            <input
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
              max={100}
              min={1}
              onChange={(event) => setBatchSize(Number(event.target.value) || 25)}
              type="number"
              value={batchSize}
            />
          </label>
        </div>

        <label className="block text-sm font-semibold text-slate-800">
          Accounts
          <textarea
            className="mt-1 min-h-52 w-full rounded-xl border border-brandBorder bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setRawRows(event.target.value)}
            placeholder={"student1@school.edu,Juan,Dela Cruz\nstudent2@school.edu,Ana,Santos"}
            value={rawRows}
          />
        </label>

        <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={submitting || parsedRows.length === 0} type="submit">
          {submitting ? "Creating Accounts..." : "Create Accounts and Send Credentials"}
        </button>

        {error ? <p className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-sm text-brandRed">{error}</p> : null}
      </form>

      {result ? (
        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brandGreen">Import Summary</p>
          <p className="mt-3 text-sm text-slate-700">
            Processed {result.processed_count} accounts. Sent {result.sent_count} emails and skipped {result.skipped_count}.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-2 py-3">Email</th>
                  <th className="px-2 py-3">Username</th>
                  <th className="px-2 py-3">Temp Password</th>
                  <th className="px-2 py-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row) => (
                  <tr className="border-b border-brandBorder/70" key={row.email}>
                    <td className="px-2 py-3">{row.email}</td>
                    <td className="px-2 py-3 font-semibold">{row.username}</td>
                    <td className="px-2 py-3 font-mono text-xs">{row.temporary_password}</td>
                    <td className="px-2 py-3 capitalize">{row.delivery_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Existing {role} accounts</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brandBorder text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                <th className="px-2 py-3">Username</th>
                <th className="px-2 py-3">Email</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr className="border-b border-brandBorder/70" key={user.id}>
                  <td className="px-2 py-3 font-semibold">{user.username}</td>
                  <td className="px-2 py-3">{user.email ?? "-"}</td>
                  <td className="px-2 py-3">
                    {user.archived_at ? "Archived" : user.must_change_password ? "Password change required" : "Active"}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                        onClick={() => void resendCredentials(user.id).then(() => refreshUsers(role))}
                        type="button"
                      >
                        Reset & Resend
                      </button>
                      {role === "teacher" && !user.archived_at ? (
                        <button
                          className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed transition hover:bg-brandRed/20"
                          onClick={() => void archiveTeacherAccount(user.id).then(() => refreshUsers(role))}
                          type="button"
                        >
                          Archive Teacher
                        </button>
                      ) : null}
                      {role === "student" && user.archived_at ? (
                        <button
                          className="rounded-lg border border-brandGreen/35 bg-brandGreenLight px-3 py-2 text-xs font-semibold text-brandGreen transition hover:bg-brandGreen/20"
                          onClick={() => void unarchiveStudentAccount(user.id).then(() => refreshUsers(role))}
                          type="button"
                        >
                          Unarchive Student
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
