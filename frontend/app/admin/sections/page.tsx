"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  archiveAdminSection,
  deleteAdminSection,
  getAdminCertificateTemplate,
  getAdminCertificateTemplatePreview,
  assignSectionMembers,
  createAdminSection,
  getAdminSections,
  getAdminUsers,
  resolveUploadsBase,
  upsertAdminCertificateTemplate,
  type AdminUser,
  type AdminCertificateTemplate,
  type LmsSection
} from "@/lib/api";
import { notifySuccess } from "@/lib/notify";

const FIXED_SIGNATORY_NAME = "Genevieve Diokno";
const FIXED_SIGNATORY_TITLE = "Founder / General Manager";
const FIXED_SIGNATORY_ORG = "Hand and Heart";

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<LmsSection[]>([]);
  const [students, setStudents] = useState<AdminUser[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignSectionId, setAssignSectionId] = useState<string>("");
  const [assignStudentId, setAssignStudentId] = useState<string>("");
  const [showCreateSectionModal, setShowCreateSectionModal] = useState(false);
  const [showAssignStudentModal, setShowAssignStudentModal] = useState(false);
  const [batchViewFilter, setBatchViewFilter] = useState<"active" | "archived">("active");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [certificateTemplateFile, setCertificateTemplateFile] = useState<File | null>(null);
  const [certificateTemplateInfo, setCertificateTemplateInfo] =
    useState<AdminCertificateTemplate | null>(null);
  const [isLoadingCertificateTemplate, setIsLoadingCertificateTemplate] = useState(false);
  const [isSavingCertificateTemplate, setIsSavingCertificateTemplate] = useState(false);
  const [isPreviewingCertificateTemplate, setIsPreviewingCertificateTemplate] = useState(false);

  async function refresh() {
    const [sectionData, studentData] = await Promise.all([
      getAdminSections(),
      getAdminUsers("student")
    ]);
    setSections(sectionData);
    setStudents(studentData);
  }

  useEffect(() => {
    void refresh().catch((requestError: Error) => setError(requestError.message));
  }, []);

  const certificateTemplatePreviewUrl = useMemo(() => {
    const raw = certificateTemplateInfo?.template_file_url?.trim();
    if (!raw) {
      return null;
    }
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    const normalized = raw.startsWith("/") ? raw : `/${raw}`;
    return `${resolveUploadsBase()}${normalized}`;
  }, [certificateTemplateInfo]);

  const assignableStudents = useMemo(() => {
    const assignedStudentIds = new Set<number>();
    for (const section of sections) {
      for (const member of section.students ?? []) {
        assignedStudentIds.add(member.id);
      }
    }
    return students.filter((student) => !assignedStudentIds.has(student.id));
  }, [sections, students]);
  const filteredSections = useMemo(
    () => sections.filter((section) => section.status === batchViewFilter),
    [batchViewFilter, sections]
  );

  async function onCreateSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingSection(true);
    try {
      await createAdminSection({ code, name, description });
      setCode("");
      setName("");
      setDescription("");
      setShowCreateSectionModal(false);
      setMessage("Batch created.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create batch.");
    } finally {
      setIsSavingSection(false);
    }
  }

  async function onAssignMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignSectionId) {
      setError("Choose a batch first.");
      return;
    }
    if (!assignStudentId) {
      setError("Choose a student first.");
      return;
    }
    setError(null);
    setMessage(null);
    setIsSavingAssignment(true);
    try {
      await assignSectionMembers(Number(assignSectionId), {
        student_ids: [Number(assignStudentId)]
      });
      setAssignStudentId("");
      setShowAssignStudentModal(false);
      setMessage("Student assigned to batch.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to assign members.");
    } finally {
      setIsSavingAssignment(false);
    }
  }

  function openAssignModal(sectionId: number) {
    setAssignSectionId(String(sectionId));
    setAssignStudentId("");
    setShowAssignStudentModal(true);
  }

  async function onArchiveBatch(sectionId: number) {
    setError(null);
    setMessage(null);
    try {
      await archiveAdminSection(sectionId);
      setMessage("Batch archived. Assigned students were archived too.");
      await refresh();
      setBatchViewFilter("archived");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to archive batch.");
    }
  }

  async function onDeleteBatch(sectionId: number) {
    setError(null);
    setMessage(null);
    try {
      await deleteAdminSection(sectionId);
      setMessage("Batch deleted.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete batch.");
    }
  }

  async function loadCertificateTemplate() {
    setIsLoadingCertificateTemplate(true);
    try {
      const response = await getAdminCertificateTemplate();
      setCertificateTemplateInfo(response);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load certificate template.");
    } finally {
      setIsLoadingCertificateTemplate(false);
    }
  }

  useEffect(() => {
    void loadCertificateTemplate();
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }
    notifySuccess(message);
    setMessage(null);
  }, [message]);

  async function onSaveCertificateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingCertificateTemplate(true);
    try {
      const response = await upsertAdminCertificateTemplate({
        signatory_name: FIXED_SIGNATORY_NAME,
        certificate_file: certificateTemplateFile,
      });
      setCertificateTemplateInfo(response);
      setCertificateTemplateFile(null);
      setMessage("E-certificate template saved.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save certificate template settings."
      );
    } finally {
      setIsSavingCertificateTemplate(false);
    }
  }

  async function onPreviewCertificateTemplate() {
    setError(null);
    setIsPreviewingCertificateTemplate(true);
    try {
      const previewBlob = await getAdminCertificateTemplatePreview();
      const previewUrl = URL.createObjectURL(previewBlob);
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to open e-certificate preview.");
    } finally {
      setIsPreviewingCertificateTemplate(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <h2 className="text-3xl font-bold title-gradient">Batch Management</h2>
        <p className="mt-2 text-sm text-slate-700">
          Use this page to create batches and place students.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">
          {error}
        </p>
      ) : null}
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Batches</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              onChange={(event) => setBatchViewFilter(event.target.value as "active" | "archived")}
              value={batchViewFilter}
            >
              <option value="active">Current Batches</option>
              <option value="archived">Archived Batches</option>
            </select>
            <button
              className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
              onClick={() => setShowCreateSectionModal(true)}
              type="button"
            >
              Add Batch
            </button>
          </div>
        </div>
        <p className="mt-3 rounded-xl border border-brandRed/35 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed">
          Note: Archive is allowed when all students in the batch complete the required modules. Delete is allowed after all students download e-certificates, or after 30 days from archiving.
        </p>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {filteredSections.map((section) => (
            <article className="rounded-2xl border border-brandBorder bg-white p-4 shadow-soft" key={section.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{section.code}</p>
                  <h3 className="mt-2 text-4xl font-bold text-slate-900">{section.name}</h3>
                  <p className="mt-2 text-sm text-slate-700">{section.description || "No description yet."}</p>
                </div>
                <span className="rounded-full bg-brandBlueLight px-3 py-1 text-xs font-semibold text-brandBlue">
                  {section.status}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-brandOffWhite px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Teachers</p>
                  <p className="mt-2 text-sm text-slate-800">All active teachers have access.</p>
                </div>
                <div className="rounded-xl bg-brandOffWhite px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Students</p>
                  <p className="mt-2 text-sm text-slate-800">{section.student_count} student(s)</p>
                  {batchViewFilter === "active" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-lg border border-brandGreen/35 bg-brandGreenLight px-3 py-2 text-xs font-semibold text-brandGreen transition hover:bg-brandGreen/20"
                        onClick={() => openAssignModal(section.id)}
                        type="button"
                      >
                        Assign Student
                      </button>
                      <button
                        className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed transition hover:bg-brandRed/20"
                        onClick={() => void onArchiveBatch(section.id)}
                        type="button"
                      >
                        Archive Batch
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <button
                        className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed transition hover:bg-brandRed/20"
                        onClick={() => void onDeleteBatch(section.id)}
                        type="button"
                      >
                        Delete Batch
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        {filteredSections.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            {batchViewFilter === "active"
              ? "No current batches yet. Click Add Batch to create one."
              : "No archived batches yet."}
          </p>
        ) : null}
      </div>

      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">E-Certificate Template</p>
        <p className="mt-2 text-sm text-slate-700">
          This template is global for all students. Name and date auto-change per student account.
        </p>

        <form className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]" onSubmit={onSaveCertificateTemplate}>
          <div className="space-y-3">
            <div className="rounded-xl border border-brandBorder bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Signatory Format</p>
              <p className="mt-2">{FIXED_SIGNATORY_NAME}</p>
              <p>{FIXED_SIGNATORY_TITLE}</p>
              <p>{FIXED_SIGNATORY_ORG}</p>
            </div>

            <div className="rounded-xl border border-brandBorder bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Certificate Text Format</p>
              <p className="mt-2">This certificate awarded to</p>
              <p>[name]</p>
              <p>for successfully completing</p>
              <p>FSL Basic Course</p>
              <p>offered by Hand and Heart</p>
            </div>

            <label className="block text-sm font-semibold text-slate-800">
              Upload Template (PNG/JPG/WEBP)
              <input
                accept=".png,.jpg,.jpeg,.webp"
                className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm"
                onChange={(event) => setCertificateTemplateFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSavingCertificateTemplate}
                type="submit"
              >
                {isSavingCertificateTemplate ? "Saving Template..." : "Save E-Certificate Template"}
              </button>
              <button
                className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue disabled:opacity-60"
                disabled={isPreviewingCertificateTemplate}
                onClick={() => {
                  void onPreviewCertificateTemplate();
                }}
                type="button"
              >
                {isPreviewingCertificateTemplate ? "Opening Preview..." : "Preview E-Certificate"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-brandBorder bg-brandOffWhite p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current Template Preview</p>
            {isLoadingCertificateTemplate ? (
              <p className="mt-3 text-sm text-slate-600">Loading template...</p>
            ) : certificateTemplatePreviewUrl ? (
              <img
                alt="Certificate template preview"
                className="mt-3 w-full rounded-xl border border-brandBorder bg-white object-contain"
                src={certificateTemplatePreviewUrl}
              />
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                No uploaded template yet. System default template will be used.
              </p>
            )}
            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Signatory Name:</span>{" "}
                {FIXED_SIGNATORY_NAME}
              </p>
              <p>
                <span className="font-semibold">Title:</span> {FIXED_SIGNATORY_TITLE}
              </p>
              <p>
                <span className="font-semibold">Organization:</span> {FIXED_SIGNATORY_ORG}
              </p>
            </div>
          </div>
        </form>
      </div>

      {showCreateSectionModal ? (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto p-4 md:py-8">
          <button
            aria-label="Close create batch modal"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => {
              if (!isSavingSection) {
                setShowCreateSectionModal(false);
              }
            }}
            type="button"
          />
          <div className="relative z-[301] my-4 w-full max-w-xl rounded-2xl border border-brandBorder bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-brandBorder px-5 py-4">
              <div>
                <h3 className="text-2xl font-bold title-gradient">Add Batch</h3>
              </div>
              <button
                className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm font-semibold text-brandBlue"
                disabled={isSavingSection}
                onClick={() => setShowCreateSectionModal(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <form className="space-y-4 p-5" onSubmit={onCreateSection}>
              <label className="block text-sm font-semibold text-slate-800">
                Code
                <input
                  className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
                  onChange={(event) => setCode(event.target.value)}
                  required
                  value={code}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Name
                <input
                  className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Description
                <textarea
                  className="mt-1 min-h-28 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white"
                  disabled={isSavingSection}
                  type="submit"
                >
                  {isSavingSection ? "Saving..." : "Create Batch"}
                </button>
                <button
                  className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue"
                  disabled={isSavingSection}
                  onClick={() => setShowCreateSectionModal(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showAssignStudentModal ? (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto p-4 md:py-8">
          <button
            aria-label="Close assign student modal"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => {
              if (!isSavingAssignment) {
                setShowAssignStudentModal(false);
              }
            }}
            type="button"
          />
          <div className="relative z-[301] my-4 w-full max-w-xl rounded-2xl border border-brandBorder bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-brandBorder px-5 py-4">
              <div>
                <h3 className="text-2xl font-bold title-gradient">Assign Student</h3>
              </div>
              <button
                className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm font-semibold text-brandBlue"
                disabled={isSavingAssignment}
                onClick={() => setShowAssignStudentModal(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <form className="space-y-4 p-5" onSubmit={onAssignMembers}>
              <label className="block text-sm font-semibold text-slate-800">
                Batch
                <select
                  className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
                  onChange={(event) => setAssignSectionId(event.target.value)}
                  value={assignSectionId}
                >
                  <option value="">Choose a batch</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-slate-800">
                Student
                <select
                  className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
                  onChange={(event) => setAssignStudentId(event.target.value)}
                  value={assignStudentId}
                >
                  <option value="">Choose a student</option>
                  {assignableStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.username}
                    </option>
                  ))}
                </select>
                {assignableStudents.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No available students. All students are already assigned to batches.
                  </p>
                ) : null}
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white"
                  disabled={isSavingAssignment}
                  type="submit"
                >
                  {isSavingAssignment ? "Saving..." : "Save Assignment"}
                </button>
                <button
                  className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue"
                  disabled={isSavingAssignment}
                  onClick={() => setShowAssignStudentModal(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
