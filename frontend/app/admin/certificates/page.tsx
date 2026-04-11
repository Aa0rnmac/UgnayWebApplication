"use client";

import { useEffect, useState } from "react";

import { getPendingCertificateTemplates, reviewCertificateTemplate, type CertificateTemplateSummary } from "@/lib/api";

export default function AdminCertificatesPage() {
  const [templates, setTemplates] = useState<CertificateTemplateSummary[]>([]);
  const [remarksByTemplate, setRemarksByTemplate] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await getPendingCertificateTemplates();
    setTemplates(data);
  }

  useEffect(() => {
    void refresh().catch((requestError: Error) => setError(requestError.message));
  }, []);

  async function onReview(templateId: number, action: "approve" | "reject") {
    try {
      await reviewCertificateTemplate(templateId, action, remarksByTemplate[templateId] ?? "");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to review template.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Certificate Approval</h2>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4">
        {templates.length === 0 ? (
          <div className="panel">
            <p className="text-sm text-slate-700">No certificate templates are waiting for review.</p>
          </div>
        ) : (
          templates.map((template) => (
            <article className="panel" key={template.id}>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{template.section_name}</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">{template.original_file_name}</h3>
              <p className="mt-2 text-sm text-slate-700">Uploaded {new Date(template.created_at).toLocaleString()}</p>
              <textarea
                className="mt-4 min-h-24 w-full rounded-xl border border-brandBorder bg-white px-3 py-3 text-sm text-slate-900"
                onChange={(event) => setRemarksByTemplate((current) => ({ ...current, [template.id]: event.target.value }))}
                placeholder="Add review remarks for the teacher."
                value={remarksByTemplate[template.id] ?? ""}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-lg bg-brandGreen px-4 py-2 text-sm font-semibold text-white" onClick={() => void onReview(template.id, "approve")} type="button">
                  Approve
                </button>
                <button className="rounded-lg bg-brandRed px-4 py-2 text-sm font-semibold text-white" onClick={() => void onReview(template.id, "reject")} type="button">
                  Reject
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
