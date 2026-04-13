"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  downloadStudentCertificate,
  getStudentCertificateDownloadStatus,
  getStudentCourse,
  type StudentCertificateDownloadStatus,
  type StudentCourse
} from "@/lib/api";

export default function StudentModulesPage() {
  const [course, setCourse] = useState<StudentCourse | null>(null);
  const [certificateStatus, setCertificateStatus] = useState<StudentCertificateDownloadStatus | null>(null);
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);
  const [certificateRecipientName, setCertificateRecipientName] = useState("Account Holder");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showArchiveNotice, setShowArchiveNotice] = useState(false);

  useEffect(() => {
    Promise.all([getStudentCourse(), getStudentCertificateDownloadStatus()])
      .then(([courseData, certificateData]) => {
        setCourse(courseData);
        setCertificateStatus(certificateData);
        setError(null);
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  useEffect(() => {
    const storedName = window.localStorage.getItem("auth_username")?.trim();
    if (storedName) {
      setCertificateRecipientName(storedName);
    }
  }, []);

  async function onDownloadCertificate() {
    if (!certificateStatus?.eligible || isDownloadingCertificate) {
      return;
    }
    try {
      setIsDownloadingCertificate(true);
      setError(null);
      const blob = await downloadStudentCertificate();
      const fileNameSeed =
        (course?.section?.name || "fsl-basic-course")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "fsl-basic-course";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ugnay-certificate-${fileNameSeed}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMessage("Certificate downloaded. Your account will be archived in 24 hours.");
      setShowArchiveNotice(true);
      const latestStatus = await getStudentCertificateDownloadStatus();
      setCertificateStatus(latestStatus);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to download certificate.");
    } finally {
      setIsDownloadingCertificate(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Student LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Modules</h2>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}
      {message ? <p className="rounded-xl border border-brandGreen/35 bg-brandGreenLight px-4 py-3 text-sm text-slate-800">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(course?.modules ?? []).map((module) => (
          <article className="panel panel-lively" key={module.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Module {module.order_index}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">{module.title}</h3>
                <p className="mt-2 text-sm text-slate-700">{module.description}</p>
                <p className="mt-2 mb-0 text-xs text-slate-600">
                  Instructor:{" "}
                  <span className="font-semibold">
                    {module.instructor_name?.trim() || "Unknown Instructor"}
                  </span>
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${module.is_locked ? "bg-brandRedLight text-brandRed" : "bg-brandBlueLight text-brandBlue"}`}>
                {module.is_locked ? "Locked" : module.status.replaceAll("_", " ")}
              </span>
            </div>
            <div className="mt-4 rounded-full bg-brandMutedSurface">
              <div className="h-3 rounded-full bg-brandBlue" style={{ width: `${module.progress_percent}%` }} />
            </div>
            <div className="mt-4 flex justify-end">
              <Link className={`rounded-lg px-4 py-2 text-sm font-semibold ${module.is_locked ? "pointer-events-none bg-brandMutedSurface text-slate-500" : "bg-brandBlue text-white"}`} href={module.is_locked ? "#" : `/modules/${module.id}`}>
                Continue
              </Link>
            </div>
          </article>
        ))}
        <article className="panel panel-lively lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Course Completion</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">E-Certificate</h3>
              <p className="mt-2 text-sm text-slate-700">
                Your certificate is unlocked after the first 12 published modules are completed.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                certificateStatus?.eligible ? "bg-brandGreenLight text-brandGreen" : "bg-brandRedLight text-brandRed"
              }`}
            >
              {certificateStatus?.eligible ? "Ready to Download" : "Locked"}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-brandBorder bg-brandOffWhite px-4 py-4 text-center">
            <p className="mb-1 text-sm text-slate-700">This certificate is awarded to</p>
            <p className="mb-1 text-xl font-bold text-brandBlue">{certificateRecipientName}</p>
            <p className="mb-1 text-sm text-slate-700">for successfully completing</p>
            <p className="mb-1 text-base font-semibold text-slate-900">FSL Basic Course</p>
            <p className="mb-0 text-sm text-slate-700">offered by Hand and Heart</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="mb-0 text-sm text-slate-600">
              {certificateStatus?.completion_date
                ? `Completion Date: ${certificateStatus.completion_date}`
                : certificateStatus?.message || "Finish the first 12 published modules to unlock your certificate."}
            </p>
            <button
              className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!certificateStatus?.eligible || isDownloadingCertificate}
              onClick={() => void onDownloadCertificate()}
              type="button"
            >
              {isDownloadingCertificate ? "Downloading..." : "Download E-Certificate"}
            </button>
          </div>
        </article>
      </div>
      {showArchiveNotice ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-brandBorder bg-white p-5 shadow-2xl">
            <h4 className="mb-2 text-lg font-bold text-slate-900">Notice</h4>
            <p className="mb-4 text-sm text-slate-700">
              Your certificate was downloaded. This student account will be archived in 24 hours.
            </p>
            <div className="flex justify-end">
              <button
                className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setShowArchiveNotice(false)}
                type="button"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
