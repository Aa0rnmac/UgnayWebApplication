"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  completeReadableItem,
  getStudentCertificateStatus,
  getStudentCourse,
  resolveUploadsBase,
  submitStudentItem,
  type ModuleAsset,
  type NumbersCategory,
  type RecognitionMode,
  type StudentCertificateStatus,
  type StudentCourse,
  type StudentCourseItem,
  type WordsCategory
} from "@/lib/api";

const CONTENT_ITEM_TYPES = new Set([
  "readable",
  "video_resource",
  "document_resource",
  "interactive_resource",
  "external_link_resource"
]);

type ReadablePresentationMode = "auto" | "cards" | "slideshow";

const NUMBER_RANGE_OPTIONS: Array<{ value: NumbersCategory; label: string }> = [
  { value: "0-10", label: "1-10" },
  { value: "11-20", label: "11-20" },
  { value: "21-30", label: "21-30" },
  { value: "31-40", label: "31-40" },
  { value: "41-50", label: "41-50" },
  { value: "51-60", label: "51-60" },
  { value: "61-70", label: "61-70" },
  { value: "71-80", label: "71-80" },
  { value: "81-90", label: "81-90" },
  { value: "91-100", label: "91-100" }
];

const WORD_CATEGORY_OPTIONS: Array<{ value: WordsCategory; label: string }> = [
  { value: "greeting", label: "Greetings" },
  { value: "responses", label: "Responses" },
  { value: "date", label: "Days / Date" },
  { value: "family", label: "Family" },
  { value: "relationship", label: "Relationship / People" },
  { value: "color", label: "Color" }
];

function displayType(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function parseReadablePresentationMode(value: unknown): ReadablePresentationMode {
  if (value === "cards" || value === "slideshow") {
    return value;
  }
  return "auto";
}

function parseAsset(value: unknown): ModuleAsset | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const kind = entry.resource_kind;
  const fileName = entry.resource_file_name;
  const filePath = entry.resource_file_path;
  if (
    (kind === "video" || kind === "image" || kind === "document" || kind === "interactive") &&
    typeof fileName === "string" &&
    typeof filePath === "string"
  ) {
    return {
      resource_kind: kind,
      resource_file_name: fileName,
      resource_file_path: filePath,
      resource_mime_type: typeof entry.resource_mime_type === "string" ? entry.resource_mime_type : undefined,
      resource_url: typeof entry.resource_url === "string" ? entry.resource_url : undefined,
      label: typeof entry.label === "string" ? entry.label : undefined
    };
  }
  return null;
}

function getAttachments(item: StudentCourseItem): ModuleAsset[] {
  const configAttachments = item.config.attachments;
  if (!Array.isArray(configAttachments)) {
    return [];
  }
  return configAttachments
    .map((entry) => parseAsset(entry))
    .filter((entry): entry is ModuleAsset => Boolean(entry));
}

function getPromptMedia(item: StudentCourseItem): ModuleAsset | null {
  return parseAsset(item.config.prompt_media);
}

function resolveAssetUrl(asset: ModuleAsset): string {
  if (asset.resource_url && /^https?:\/\//i.test(asset.resource_url)) {
    return asset.resource_url;
  }
  if (asset.resource_url && asset.resource_url.startsWith("/")) {
    return `${resolveUploadsBase()}${asset.resource_url}`;
  }
  const path = asset.resource_file_path.replace(/^\/+/, "");
  return `${resolveUploadsBase()}/${path}`;
}

function resolveLegacyResourceUrl(item: StudentCourseItem): string | null {
  const resourcePath = typeof item.config.resource_file_path === "string" ? item.config.resource_file_path : "";
  const resourceUrl = typeof item.config.resource_url === "string" ? item.config.resource_url : "";
  if (resourcePath) {
    return `${resolveUploadsBase()}/${resourcePath.replace(/^\/+/, "")}`;
  }
  if (resourceUrl) {
    if (/^https?:\/\//i.test(resourceUrl)) {
      return resourceUrl;
    }
    if (resourceUrl.startsWith("/")) {
      return `${resolveUploadsBase()}${resourceUrl}`;
    }
    return resourceUrl;
  }
  return null;
}

function getFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

function defaultReadableLabel(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  return baseName || fileName;
}

function resolveAssetLabel(asset: ModuleAsset): string {
  const savedLabel = typeof asset.label === "string" ? asset.label.trim() : "";
  if (savedLabel) {
    return savedLabel;
  }
  return defaultReadableLabel(asset.resource_file_name);
}

function parseLabMode(value: unknown): RecognitionMode | null {
  return value === "alphabet" || value === "numbers" || value === "words" ? value : null;
}

function parseNumbersCategory(value: unknown): NumbersCategory | null {
  return NUMBER_RANGE_OPTIONS.some((entry) => entry.value === value)
    ? (value as NumbersCategory)
    : null;
}

function parseWordsCategory(value: unknown): WordsCategory | null {
  return WORD_CATEGORY_OPTIONS.some((entry) => entry.value === value)
    ? (value as WordsCategory)
    : null;
}

function getSigningLabSetup(item: StudentCourseItem): {
  mode: RecognitionMode;
  numbersCategory: NumbersCategory | null;
  wordsCategory: WordsCategory | null;
} {
  const mode = parseLabMode(item.config.lab_mode) ?? "alphabet";
  const numbersCategory = parseNumbersCategory(item.config.numbers_category);
  const wordsCategory = parseWordsCategory(item.config.words_category);
  return { mode, numbersCategory, wordsCategory };
}

function numbersRangeLabel(value: NumbersCategory | null): string {
  if (!value) {
    return "Not set";
  }
  return NUMBER_RANGE_OPTIONS.find((entry) => entry.value === value)?.label ?? value;
}

function wordsCategoryLabel(value: WordsCategory | null): string {
  if (!value) {
    return "Not set";
  }
  return WORD_CATEGORY_OPTIONS.find((entry) => entry.value === value)?.label ?? value;
}

function buildLabHref(setup: {
  mode: RecognitionMode;
  numbersCategory: NumbersCategory | null;
  wordsCategory: WordsCategory | null;
}): string {
  const query = new URLSearchParams();
  query.set("mode", setup.mode);
  if (setup.mode === "numbers" && setup.numbersCategory) {
    query.set("numbers", setup.numbersCategory);
  }
  if (setup.mode === "words" && setup.wordsCategory) {
    query.set("words", setup.wordsCategory);
  }
  return `/lab?${query.toString()}`;
}

export default function StudentModulePlayerPage() {
  const params = useParams<{ moduleId: string }>();
  const [course, setCourse] = useState<StudentCourse | null>(null);
  const [certificateStatus, setCertificateStatus] = useState<StudentCertificateStatus | null>(null);
  const [answerByItem, setAnswerByItem] = useState<Record<number, string>>({});
  const [slideshowIndexByItem, setSlideshowIndexByItem] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refresh() {
    const [courseData, certificateData] = await Promise.all([getStudentCourse(), getStudentCertificateStatus()]);
    setCourse(courseData);
    setCertificateStatus(certificateData);
  }

  useEffect(() => {
    void refresh().catch((requestError: Error) => setError(requestError.message));
  }, []);

  const moduleId = Number(params.moduleId);
  const currentModule = useMemo(
    () => course?.modules.find((module) => module.id === moduleId) ?? null,
    [course, moduleId]
  );
  const currentItem = useMemo(
    () =>
      currentModule?.items.find((item) => !item.is_locked && item.status !== "completed") ??
      currentModule?.items[0] ??
      null,
    [currentModule]
  );

  async function onCompleteReadable(item: StudentCourseItem) {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await completeReadableItem(item.id, 30);
      setMessage("Reading completed. The next item is now unlocked.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to complete item.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSubmitItem(event: FormEvent<HTMLFormElement>, item: StudentCourseItem) {
    event.preventDefault();
    const responseText = (answerByItem[item.id] ?? "").trim();
    if (!responseText) {
      setError("Please provide your answer before submitting.");
      return;
    }
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await submitStudentItem(item.id, {
        response_text: responseText,
        duration_seconds: 60,
        score_percent: item.item_type === "signing_lab_assessment" ? 100 : undefined,
        extra_payload: { helper: "student-module-player" }
      });
      setMessage("Answer submitted. Continue to the next item.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit item.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderAssetCard(asset: ModuleAsset) {
    const url = resolveAssetUrl(asset);
    if (asset.resource_kind === "image") {
      const label = resolveAssetLabel(asset);
      return (
        <article className="card h-100 border-brandBorder">
          <div
            className="d-flex align-items-center justify-content-center bg-brandOffWhite p-2"
            style={{ minHeight: "220px" }}
          >
            <img
              alt={asset.resource_file_name}
              className="mw-100 rounded-2 object-contain"
              src={url}
              style={{ maxHeight: "220px" }}
            />
          </div>
          <div className="card-body text-center">
            <p className="fw-semibold mb-1">{label}</p>
            <p className="card-text small text-slate-600 mb-2">{asset.resource_file_name}</p>
            <a className="btn btn-outline-primary btn-sm" href={url} rel="noreferrer" target="_blank">
              Open Image
            </a>
          </div>
        </article>
      );
    }
    if (asset.resource_kind === "video") {
      return (
        <article className="card h-100 border-brandBorder">
          <video className="w-100 max-h-48 rounded-top" controls preload="metadata" src={url} />
          <div className="card-body">
            <p className="card-text small mb-2">{asset.resource_file_name}</p>
            <a className="btn btn-outline-primary btn-sm" href={url} rel="noreferrer" target="_blank">
              Open Video
            </a>
          </div>
        </article>
      );
    }
    return (
      <article className="card h-100 border-brandBorder">
        <div className="card-body d-flex flex-column">
          <p className="mb-1 text-xs text-uppercase tracking-[0.12em] text-slate-500">
            {asset.resource_kind === "interactive" ? "Interactive File" : "Document"}
          </p>
          <p className="card-text small mb-3">{asset.resource_file_name}</p>
          <a className="btn btn-outline-primary btn-sm mt-auto" href={url} rel="noreferrer" target="_blank">
            Open File
          </a>
        </div>
      </article>
    );
  }

  function renderSlideshowAsset(asset: ModuleAsset) {
    const url = resolveAssetUrl(asset);
    if (asset.resource_kind === "image") {
      return (
        <div className="vstack gap-2">
          <div
            className="d-flex align-items-center justify-content-center rounded-3 border border-brandBorder bg-brandOffWhite p-2"
            style={{ minHeight: "280px" }}
          >
            <img
              alt={asset.resource_file_name}
              className="mw-100 rounded-3 object-contain"
              src={url}
              style={{ maxHeight: "420px" }}
            />
          </div>
          <p className="mb-0 small text-slate-600 text-center">{resolveAssetLabel(asset)}</p>
        </div>
      );
    }
    if (asset.resource_kind === "video") {
      return (
        <div className="vstack gap-2">
          <video className="w-100 rounded-3 max-h-96" controls preload="metadata" src={url} />
          <p className="mb-0 small text-slate-600">{asset.resource_file_name}</p>
        </div>
      );
    }
    const extension = getFileExtension(asset.resource_file_name);
    if (extension === ".pdf") {
      return (
        <div className="vstack gap-2">
          <iframe className="w-100 rounded-3 border border-brandBorder" src={url} style={{ height: "420px" }} title={asset.resource_file_name} />
          <a className="btn btn-outline-primary btn-sm align-self-start" href={url} rel="noreferrer" target="_blank">
            Open PDF
          </a>
        </div>
      );
    }
    return (
      <div className="card border-brandBorder bg-brandOffWhite">
        <div className="card-body">
          <p className="mb-2 fw-semibold">{asset.resource_file_name}</p>
          <p className="mb-2 small text-slate-700">
            Slide preview is not available for this file type. Open the file to present it.
          </p>
          <a className="btn btn-outline-primary btn-sm" href={url} rel="noreferrer" target="_blank">
            Open File
          </a>
        </div>
      </div>
    );
  }

  function renderReadableItem(item: StudentCourseItem) {
    const attachments = getAttachments(item);
    const legacyResourceUrl = resolveLegacyResourceUrl(item);
    const presentationMode = parseReadablePresentationMode(item.config.presentation_mode);
    const cardVideos = attachments.filter((asset) => asset.resource_kind === "video");
    const cardNonVideos = attachments.filter((asset) => asset.resource_kind !== "video");
    const currentSlideRaw = slideshowIndexByItem[item.id] ?? 0;
    const currentSlide =
      attachments.length > 0 ? Math.min(Math.max(currentSlideRaw, 0), attachments.length - 1) : 0;
    const currentAsset = attachments[currentSlide];
    return (
      <div className="vstack gap-3">
        <div className="rounded-3 bg-brandOffWhite px-4 py-3 text-sm leading-7 text-slate-700">
          {item.content_text || "No reading content yet."}
        </div>
        {attachments.length > 0 && presentationMode === "slideshow" ? (
          <div className="card border-brandBorder">
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <p className="mb-0 fw-semibold">
                  Slide {currentSlide + 1} of {attachments.length}
                </p>
                <div className="btn-group btn-group-sm" role="group" aria-label="Slide navigation">
                  <button
                    className="btn btn-outline-secondary"
                    disabled={currentSlide <= 0}
                    onClick={() =>
                      setSlideshowIndexByItem((current) => ({
                        ...current,
                        [item.id]: Math.max((current[item.id] ?? 0) - 1, 0)
                      }))
                    }
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    disabled={currentSlide >= attachments.length - 1}
                    onClick={() =>
                      setSlideshowIndexByItem((current) => ({
                        ...current,
                        [item.id]: Math.min((current[item.id] ?? 0) + 1, attachments.length - 1)
                      }))
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
              {currentAsset ? renderSlideshowAsset(currentAsset) : null}
            </div>
          </div>
        ) : null}
        {attachments.length > 0 && presentationMode !== "slideshow" ? (
          <div className="vstack gap-3">
            {cardVideos.map((asset) => (
              <div className="card border-brandBorder" key={`${asset.resource_file_name}-${asset.resource_file_path}`}>
                <video className="w-100 rounded-top" controls preload="metadata" src={resolveAssetUrl(asset)} />
                <div className="card-body py-2">
                  <p className="mb-0 small text-slate-600">{asset.resource_file_name}</p>
                </div>
              </div>
            ))}
            <div className="row g-3">
              {cardNonVideos.map((asset) => (
                <div className="col-12 col-md-4" key={`${asset.resource_file_name}-${asset.resource_file_path}`}>
                  {renderAssetCard(asset)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {attachments.length === 0 && legacyResourceUrl ? (
          <a className="btn btn-outline-primary align-self-start" href={legacyResourceUrl} rel="noreferrer" target="_blank">
            Open Resource
          </a>
        ) : null}
        <button className="btn btn-primary align-self-start" disabled={isSubmitting} onClick={() => void onCompleteReadable(item)} type="button">
          {isSubmitting ? "Saving..." : "Mark as Complete"}
        </button>
      </div>
    );
  }

  function renderItem(item: StudentCourseItem) {
    if (CONTENT_ITEM_TYPES.has(item.item_type)) {
      return renderReadableItem(item);
    }

    const promptMedia = getPromptMedia(item);
    const promptMediaUrl = promptMedia ? resolveAssetUrl(promptMedia) : null;
    const question =
      (item.config.question as string | undefined) ||
      (item.config.helper_text as string | undefined) ||
      item.instructions ||
      "Answer this activity.";
    const choices = Array.isArray(item.config.choices) ? (item.config.choices as string[]) : [];

    return (
      <form className="vstack gap-3" onSubmit={(event) => void onSubmitItem(event, item)}>
        <div className="rounded-3 bg-brandOffWhite px-4 py-3 text-sm text-slate-700">{question}</div>

        {item.item_type === "identification_assessment" && promptMedia && promptMediaUrl ? (
          <div className="card border-brandBorder">
            {promptMedia.resource_kind === "video" ? (
              <video className="w-100 rounded-top max-h-80" controls preload="metadata" src={promptMediaUrl} />
            ) : (
              <img alt={promptMedia.resource_file_name} className="card-img-top object-cover max-h-80" src={promptMediaUrl} />
            )}
            <div className="card-body py-2">
              <p className="mb-0 small text-slate-600">{promptMedia.resource_file_name}</p>
            </div>
          </div>
        ) : null}

        {item.item_type === "multiple_choice_assessment" && choices.length > 0 ? (
          <div className="vstack gap-2">
            {choices.map((choice) => (
              <label className="card border-brandBorder shadow-sm cursor-pointer" key={choice}>
                <div className="card-body py-2 px-3 d-flex gap-2 align-items-center">
                  <input
                    checked={answerByItem[item.id] === choice}
                    className="form-check-input"
                    onChange={() => setAnswerByItem((current) => ({ ...current, [item.id]: choice }))}
                    type="radio"
                  />
                  <span className="text-sm text-slate-800">{choice}</span>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <input
            className="form-control"
            onChange={(event) => setAnswerByItem((current) => ({ ...current, [item.id]: event.target.value }))}
            placeholder={
              item.item_type === "signing_lab_assessment"
                ? "Type the sign result after camera analysis."
                : "Type your answer here."
            }
            value={answerByItem[item.id] ?? ""}
          />
        )}

        {item.item_type === "signing_lab_assessment" ? (
          (() => {
            const setup = getSigningLabSetup(item);
            return (
              <div className="alert alert-warning mb-0">
                <p className="mb-2 fw-semibold">Camera interface setup</p>
                <p className="mb-1">
                  Mode: <span className="fw-semibold">{displayType(setup.mode)}</span>
                </p>
                {setup.mode === "numbers" ? (
                  <p className="mb-1">
                    Range: <span className="fw-semibold">{numbersRangeLabel(setup.numbersCategory)}</span>
                  </p>
                ) : null}
                {setup.mode === "words" ? (
                  <p className="mb-2">
                    Category: <span className="fw-semibold">{wordsCategoryLabel(setup.wordsCategory)}</span>
                  </p>
                ) : null}
                <a
                  className="btn btn-sm btn-outline-dark"
                  href={buildLabHref(setup)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open Camera Interface
                </a>
              </div>
            );
          })()
        ) : null}

        <button className="btn btn-primary align-self-start" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Submitting..." : "Submit Answer"}
        </button>
      </form>
    );
  }

  return (
    <section className="space-y-4">
      <div className="panel">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <p className="text-xs fw-semibold text-uppercase tracking-[0.2em] text-brandBlue">Student LMS</p>
            <h2 className="mt-2 text-3xl fw-bold title-gradient">{currentModule?.title ?? "Module Player"}</h2>
            <p className="mt-2 text-sm text-slate-700">
              Complete each item in order. Locked items open when the previous item is done.
            </p>
          </div>
          <Link className="btn btn-outline-secondary" href="/modules">
            Back to Modules
          </Link>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger mb-0" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success mb-0" role="alert">
          {message}
        </div>
      ) : null}

      {currentModule ? (
        <div className="row g-4">
          <aside className="col-xl-4">
            <div className="panel h-100">
              <p className="mb-3 text-xs fw-semibold text-uppercase tracking-[0.16em] text-slate-500">Course Flow</p>
              <div className="vstack gap-3">
                {(course?.modules ?? []).map((module) => (
                  <div
                    className={`card border ${module.id === currentModule.id ? "border-primary" : "border-brandBorder"}`}
                    key={module.id}
                  >
                    <div className="card-body py-3">
                      <div className="d-flex justify-content-between gap-2">
                        <div>
                          <p className="mb-1 text-xs text-uppercase tracking-[0.12em] text-slate-500">
                            Module {module.order_index}
                          </p>
                          <p className="mb-0 fw-semibold text-sm">{module.title}</p>
                        </div>
                        <span className={`badge ${module.is_locked ? "text-bg-secondary" : "text-bg-success"}`}>
                          {module.is_locked ? "Locked" : `${module.progress_percent}%`}
                        </span>
                      </div>
                      {module.id === currentModule.id ? (
                        <div className="vstack gap-2 mt-3">
                          {module.items.map((item) => (
                            <div
                              className={`rounded-3 border px-2 py-2 text-sm ${
                                item.is_locked
                                  ? "border-brandBorder bg-brandMutedSurface text-slate-500"
                                  : item.status === "completed"
                                    ? "border-success-subtle bg-success-subtle text-slate-800"
                                    : "border-primary-subtle bg-white text-slate-800"
                              }`}
                              key={item.id}
                            >
                              <div className="d-flex justify-content-between gap-2">
                                <span>
                                  {item.order_index}. {item.title}
                                </span>
                                <span className="text-xs text-uppercase">{item.is_locked ? "Locked" : item.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="col-xl-8">
            <div className="panel h-100">
              {currentItem ? (
                <>
                  <p className="mb-2 text-xs fw-semibold text-uppercase tracking-[0.16em] text-slate-500">
                    Item {currentItem.order_index} - {displayType(currentItem.item_type)}
                  </p>
                  <h3 className="h4 fw-bold mb-1">{currentItem.title}</h3>
                  <p className="text-sm text-slate-700 mb-3">
                    {currentItem.instructions || "Complete this item to unlock the next one."}
                  </p>
                  {currentItem.is_locked ? (
                    <div className="alert alert-secondary mb-0">
                      Complete the previous item first before opening this one.
                    </div>
                  ) : (
                    renderItem(currentItem)
                  )}
                </>
              ) : (
                <p className="mb-0 text-sm text-slate-700">No available learning item.</p>
              )}

              {certificateStatus?.eligible ? (
                <div className="alert alert-success mt-4 mb-0">
                  Certificate ready for <span className="fw-semibold">{certificateStatus.section_name}</span>.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
