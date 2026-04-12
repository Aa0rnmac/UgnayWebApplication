"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  completeReadableItem,
  getStudentCertificateDownloadStatus,
  getStudentCourse,
  type ModuleAsset,
  resolveUploadsBase,
  submitStudentItem,
  type StudentCertificateDownloadStatus,
  type StudentCourse,
  type StudentCourseItem,
  type StudentCourseModule
} from "@/lib/api";

const CONTENT_ITEM_TYPES = new Set([
  "readable",
  "video_resource",
  "document_resource",
  "interactive_resource",
  "external_link_resource"
]);

function isContentItemType(itemType: StudentCourseItem["item_type"]) {
  return CONTENT_ITEM_TYPES.has(itemType);
}

type ReadablePresentationMode = "auto" | "cards" | "slideshow";

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
  const candidate = value as Record<string, unknown>;
  const kind = candidate.resource_kind;
  const fileName = candidate.resource_file_name;
  const filePath = candidate.resource_file_path;
  if (
    (kind === "video" || kind === "image" || kind === "document" || kind === "interactive") &&
    typeof fileName === "string" &&
    typeof filePath === "string"
  ) {
    return {
      resource_kind: kind,
      resource_file_name: fileName,
      resource_file_path: filePath,
      resource_mime_type:
        typeof candidate.resource_mime_type === "string" ? candidate.resource_mime_type : null,
      resource_url: typeof candidate.resource_url === "string" ? candidate.resource_url : null,
      label: typeof candidate.label === "string" ? candidate.label : null
    };
  }
  return null;
}

function inferAssetKind(item: StudentCourseItem, fileName: string, mimeType: string): ModuleAsset["resource_kind"] {
  const lowerFileName = fileName.toLowerCase();
  const lowerMimeType = mimeType.toLowerCase();

  if (
    item.item_type === "video_resource" ||
    lowerMimeType.startsWith("video/") ||
    [".mp4", ".webm", ".mov", ".avi", ".mkv"].some((suffix) => lowerFileName.endsWith(suffix))
  ) {
    return "video";
  }
  if (
    lowerMimeType.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"].some((suffix) =>
      lowerFileName.endsWith(suffix)
    )
  ) {
    return "image";
  }
  if (item.item_type === "interactive_resource") {
    return "interactive";
  }
  return "document";
}

function legacyResourceAsAsset(item: StudentCourseItem): ModuleAsset | null {
  const resourcePath = typeof item.config.resource_file_path === "string" ? item.config.resource_file_path.trim() : "";
  const resourceUrl = typeof item.config.resource_url === "string" ? item.config.resource_url.trim() : "";
  if (!resourcePath && !resourceUrl) {
    return null;
  }
  const resourceFileName =
    (typeof item.config.resource_file_name === "string" && item.config.resource_file_name.trim()) ||
    item.title ||
    "Resource File";
  const resourceMimeType =
    typeof item.config.resource_mime_type === "string" ? item.config.resource_mime_type : "";
  const pathFallback = resourcePath || resourceUrl.replace(/^https?:\/\/[^/]+\/?/i, "");

  return {
    resource_kind: inferAssetKind(item, resourceFileName, resourceMimeType),
    resource_file_name: resourceFileName,
    resource_file_path: pathFallback,
    resource_mime_type: resourceMimeType || null,
    resource_url: resourceUrl || null,
    label: null
  };
}

function getItemAttachments(item: StudentCourseItem): ModuleAsset[] {
  const raw = item.config.attachments;
  if (Array.isArray(raw)) {
    const attachments = raw
      .map((entry) => parseAsset(entry))
      .filter((entry): entry is ModuleAsset => Boolean(entry));
    if (attachments.length > 0) {
      return attachments;
    }
  }
  const legacyAsset = legacyResourceAsAsset(item);
  return legacyAsset ? [legacyAsset] : [];
}

function getPromptMedia(item: StudentCourseItem): ModuleAsset | null {
  return parseAsset(item.config.prompt_media);
}

function mcqQuestionAssetLabel(questionKey: string): string {
  return `mcq-question:${questionKey}`;
}

function getMcqQuestionPromptAsset(attachments: ModuleAsset[], questionKey: string): ModuleAsset | null {
  const targetLabel = mcqQuestionAssetLabel(questionKey).toLowerCase();
  for (let index = attachments.length - 1; index >= 0; index -= 1) {
    const label = (attachments[index]?.label ?? "").trim().toLowerCase();
    if (label === targetLabel) {
      return attachments[index] ?? null;
    }
  }
  return null;
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

function resolveAssetLabel(asset: ModuleAsset): string {
  const label = typeof asset.label === "string" ? asset.label.trim() : "";
  if (label) {
    return label;
  }
  const baseName = asset.resource_file_name.replace(/\.[^.]+$/, "").trim();
  return baseName || asset.resource_file_name;
}

type McqQuestionConfig = {
  question_key: string;
  question: string;
  choices: string[];
};

function getMcqQuestionSet(item: StudentCourseItem): McqQuestionConfig[] {
  const rawQuestionSet = item.config.questions;
  if (Array.isArray(rawQuestionSet) && rawQuestionSet.length > 0) {
    const parsed = rawQuestionSet
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const question = typeof row.question === "string" ? row.question.trim() : "";
        const choices = Array.isArray(row.choices)
          ? (row.choices as unknown[]).map((choice) => String(choice).trim()).filter(Boolean)
          : [];
        const questionKey =
          typeof row.question_key === "string" && row.question_key.trim()
            ? row.question_key.trim()
            : `q${index + 1}`;
        if (!question || choices.length < 2) {
          return null;
        }
        return {
          question_key: questionKey,
          question,
          choices,
        };
      })
      .filter((entry): entry is McqQuestionConfig => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const question = typeof item.config.question === "string" ? item.config.question.trim() : "";
  const choices = Array.isArray(item.config.choices)
    ? (item.config.choices as unknown[]).map((choice) => String(choice).trim()).filter(Boolean)
    : [];
  if (question && choices.length >= 2) {
    return [{ question_key: "q1", question, choices }];
  }
  return [];
}

export default function StudentModulePlayerPage() {
  const params = useParams<{ moduleId: string }>();
  const [course, setCourse] = useState<StudentCourse | null>(null);
  const [certificateStatus, setCertificateStatus] = useState<StudentCertificateDownloadStatus | null>(null);
  const [answerByItem, setAnswerByItem] = useState<Record<number, string>>({});
  const [mcqAnswersByItem, setMcqAnswersByItem] = useState<Record<number, Record<string, string>>>({});
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [slideshowIndexByItem, setSlideshowIndexByItem] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(options?: { tolerateCertificateError?: boolean }) {
    const tolerateCertificateError = options?.tolerateCertificateError ?? false;
    const courseData = await getStudentCourse();
    setCourse(courseData);

    try {
      const certificateData = await getStudentCertificateDownloadStatus();
      setCertificateStatus(certificateData);
    } catch (certificateError) {
      setCertificateStatus(null);
      if (!tolerateCertificateError) {
        throw certificateError;
      }
    }

    setError(null);
  }

  useEffect(() => {
    void refresh().catch((requestError: Error) => setError(requestError.message));
  }, []);

  const moduleId = Number(params.moduleId);
  const currentModule = useMemo(
    () => course?.modules.find((module) => module.id === moduleId) ?? null,
    [course, moduleId]
  );
  const fallbackItemId = useMemo(() => {
    if (!currentModule) {
      return null;
    }
    const preferred =
      currentModule.items.find((item) => !item.is_locked && item.status !== "completed") ??
      currentModule.items.find((item) => !item.is_locked) ??
      currentModule.items[0];
    return preferred?.id ?? null;
  }, [currentModule]);

  useEffect(() => {
    if (!currentModule) {
      setSelectedItemId(null);
      return;
    }
    setSelectedItemId((current) => {
      if (current !== null) {
        const existingItem = currentModule.items.find((item) => item.id === current);
        if (existingItem && !existingItem.is_locked) {
          return current;
        }
      }
      return fallbackItemId;
    });
  }, [currentModule, fallbackItemId]);

  const currentItem = useMemo(
    () =>
      currentModule?.items.find((item) => item.id === selectedItemId && !item.is_locked) ??
      currentModule?.items.find((item) => !item.is_locked && item.status !== "completed") ??
      currentModule?.items.find((item) => !item.is_locked) ??
      currentModule?.items[0] ??
      null,
    [currentModule, selectedItemId]
  );
  const navigableItems = useMemo(
    () => currentModule?.items.filter((item) => !item.is_locked) ?? [],
    [currentModule]
  );
  const currentItemIndex = useMemo(
    () => (currentItem ? navigableItems.findIndex((item) => item.id === currentItem.id) : -1),
    [currentItem, navigableItems]
  );
  const previousItem = currentItemIndex > 0 ? navigableItems[currentItemIndex - 1] : null;
  const nextItem =
    currentItemIndex >= 0 && currentItemIndex < navigableItems.length - 1
      ? navigableItems[currentItemIndex + 1]
      : null;

  const showCompleteAction = Boolean(
    currentItem &&
      !currentItem.is_locked &&
      currentItem.status !== "completed" &&
      isContentItemType(currentItem.item_type)
  );

  async function onCompleteReadable(item: StudentCourseItem) {
    try {
      setError(null);
      await completeReadableItem(item.id, 30);
      setMessage("Item completed. The next item is now available.");
      setSelectedItemId(null);
      await refresh({ tolerateCertificateError: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to complete item.");
    }
  }

  async function onSubmitItem(event: FormEvent<HTMLFormElement>, item: StudentCourseItem) {
    event.preventDefault();
    try {
      setError(null);
      let responseText = answerByItem[item.id] ?? "";
      const extraPayload: Record<string, unknown> = { helper: "student-module-player" };
      if (item.item_type === "multiple_choice_assessment") {
        const questionSet = getMcqQuestionSet(item);
        if (questionSet.length > 1) {
          const questionAnswers = mcqAnswersByItem[item.id] ?? {};
          const hasMissingAnswer = questionSet.some(
            (question) => !(questionAnswers[question.question_key] ?? "").trim()
          );
          if (hasMissingAnswer) {
            setError("Please answer all questions before submitting.");
            return;
          }
          responseText = "multi-question-submission";
          extraPayload.question_answers = questionAnswers;
          extraPayload.question_total = questionSet.length;
        }
      }
      if (!responseText.trim()) {
        setError("Please provide an answer before submitting.");
        return;
      }
      await submitStudentItem(item.id, {
        response_text: responseText,
        duration_seconds: 60,
        score_percent: item.item_type === "signing_lab_assessment" ? 100 : undefined,
        extra_payload: extraPayload
      });
      setMessage("Answer saved. Continue to the next item.");
      setSelectedItemId(null);
      await refresh({ tolerateCertificateError: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit item.");
    }
  }

  function renderItem(item: StudentCourseItem) {
    function renderReadableAsset(asset: ModuleAsset) {
      const url = resolveAssetUrl(asset);
      if (asset.resource_kind === "image") {
        return (
          <div
            className="flex items-center justify-center rounded-xl border border-brandBorder bg-brandOffWhite p-2"
            style={{ minHeight: "220px" }}
          >
            <img
              alt={asset.resource_file_name}
              className="w-full rounded-xl object-contain"
              loading="lazy"
              src={url}
              style={{ maxHeight: "320px" }}
            />
          </div>
        );
      }
      if (asset.resource_kind === "video") {
        return <video className="w-full rounded-xl" controls preload="metadata" src={url} />;
      }
      return (
        <a
          className="inline-flex rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          Open {asset.resource_file_name}
        </a>
      );
    }

    if (isContentItemType(item.item_type)) {
      const attachments = getItemAttachments(item);
      const presentationMode = parseReadablePresentationMode(item.config.presentation_mode);
      const videoAttachments = attachments.filter((asset) => asset.resource_kind === "video");
      const nonVideoAttachments = attachments.filter((asset) => asset.resource_kind !== "video");
      const currentSlideIndex =
        attachments.length > 0
          ? Math.min(
              Math.max(slideshowIndexByItem[item.id] ?? 0, 0),
              attachments.length - 1
            )
          : 0;
      const slideAsset = attachments[currentSlideIndex];
      return (
        <div className="space-y-4">
          <p className="rounded-xl bg-brandOffWhite px-4 py-4 text-sm leading-7 text-slate-700">
            {item.content_text || "No reading content yet."}
          </p>
          {attachments.length > 0 && presentationMode !== "slideshow" ? (
            <div className="space-y-4">
              {videoAttachments.map((asset) => (
                <div className="rounded-2xl border border-brandBorder bg-white p-3" key={`${asset.resource_file_path}-${asset.resource_file_name}`}>
                  {renderReadableAsset(asset)}
                  <p className="mt-2 text-center text-sm font-semibold text-slate-700">{resolveAssetLabel(asset)}</p>
                </div>
              ))}
              {nonVideoAttachments.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {nonVideoAttachments.map((asset) => (
                    <div className="rounded-2xl border border-brandBorder bg-white p-3" key={`${asset.resource_file_path}-${asset.resource_file_name}`}>
                      {renderReadableAsset(asset)}
                      <p className="mt-2 text-center text-sm font-semibold text-slate-700">{resolveAssetLabel(asset)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {attachments.length > 0 && presentationMode === "slideshow" ? (
            <div className="rounded-2xl border border-brandBorder bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="mb-0 text-sm font-semibold text-slate-700">
                  Slide {currentSlideIndex + 1} of {attachments.length}
                </p>
                <div className="flex gap-2">
                  <button
                    className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    disabled={currentSlideIndex <= 0}
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
                    className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    disabled={currentSlideIndex >= attachments.length - 1}
                    onClick={() =>
                      setSlideshowIndexByItem((current) => ({
                        ...current,
                        [item.id]: Math.min(
                          (current[item.id] ?? 0) + 1,
                          attachments.length - 1
                        )
                      }))
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
              {slideAsset ? renderReadableAsset(slideAsset) : null}
              {slideAsset ? (
                <p className="mt-2 text-center text-sm font-semibold text-slate-700">{resolveAssetLabel(slideAsset)}</p>
              ) : null}
            </div>
          ) : null}
          {attachments.length === 0 ? (
            <p className="rounded-xl border border-brandBorder bg-white px-4 py-3 text-sm text-slate-600">
              No uploaded files for this topic yet.
            </p>
          ) : null}
        </div>
      );
    }

    const question =
      (item.config.question as string | undefined) ||
      (item.config.helper_text as string | undefined) ||
      item.instructions ||
      "Answer this activity.";
    const choices = Array.isArray(item.config.choices) ? (item.config.choices as string[]) : [];
    const attachments = getItemAttachments(item);
    const promptMedia = getPromptMedia(item);
    const mcqQuestionSet =
      item.item_type === "multiple_choice_assessment" ? getMcqQuestionSet(item) : [];
    const isMultiQuestionMcq =
      item.item_type === "multiple_choice_assessment" && mcqQuestionSet.length > 1;
    const multiAnswers = mcqAnswersByItem[item.id] ?? {};
    const hasQuestionPrompt =
      item.item_type === "multiple_choice_assessment" &&
      mcqQuestionSet.some((entry) => Boolean(getMcqQuestionPromptAsset(attachments, entry.question_key)));
    const singleQuestionPrompt =
      item.item_type === "multiple_choice_assessment"
        ? getMcqQuestionPromptAsset(attachments, mcqQuestionSet[0]?.question_key ?? "q1") || promptMedia
        : null;

    return (
      <form className="space-y-4" onSubmit={(event) => void onSubmitItem(event, item)}>
        <p className="rounded-xl bg-brandOffWhite px-4 py-4 text-sm leading-7 text-slate-700">
          {isMultiQuestionMcq
            ? item.instructions || "Answer all questions to complete this assessment."
            : question}
        </p>
        {item.item_type === "multiple_choice_assessment" && isMultiQuestionMcq ? (
          <div className="space-y-3">
            {promptMedia && !hasQuestionPrompt ? (
              <div className="rounded-xl border border-brandBorder bg-white p-3">
                {renderReadableAsset(promptMedia)}
              </div>
            ) : null}
            {mcqQuestionSet.map((entry, questionIndex) => {
              const questionPrompt = getMcqQuestionPromptAsset(attachments, entry.question_key);
              return (
                <div className="rounded-xl border border-brandBorder bg-white px-3 py-3" key={entry.question_key}>
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    {questionIndex + 1}. {entry.question}
                  </p>
                  {questionPrompt ? (
                    <div className="mb-3 rounded-lg border border-brandBorder bg-brandOffWhite p-2">
                      {renderReadableAsset(questionPrompt)}
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    {entry.choices.map((choice) => (
                      <button
                        className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${multiAnswers[entry.question_key] === choice ? "border-brandBlue bg-brandBlueLight text-brandBlue" : "border-brandBorder bg-white text-slate-700"}`}
                        key={`${entry.question_key}-${choice}`}
                        onClick={() =>
                          setMcqAnswersByItem((current) => ({
                            ...current,
                            [item.id]: {
                              ...(current[item.id] ?? {}),
                              [entry.question_key]: choice
                            }
                          }))
                        }
                        type="button"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : item.item_type === "multiple_choice_assessment" && choices.length > 0 ? (
          <div className="space-y-3">
            {singleQuestionPrompt ? (
              <div className="rounded-xl border border-brandBorder bg-white p-3">
                {renderReadableAsset(singleQuestionPrompt)}
              </div>
            ) : null}
            <div className="grid gap-2">
              {choices.map((choice) => (
                <button
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${answerByItem[item.id] === choice ? "border-brandBlue bg-brandBlueLight text-brandBlue" : "border-brandBorder bg-white text-slate-700"}`}
                  key={choice}
                  onClick={() => setAnswerByItem((current) => ({ ...current, [item.id]: choice }))}
                  type="button"
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <input
            className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setAnswerByItem((current) => ({ ...current, [item.id]: event.target.value }))}
            placeholder={
              item.item_type === "signing_lab_assessment"
                ? "Type the sign result after checking your camera practice."
                : "Type your answer here."
            }
            value={answerByItem[item.id] ?? ""}
          />
        )}
        {item.item_type === "signing_lab_assessment" ? (
          <p className="rounded-xl border border-brandYellow/35 bg-brandYellowLight px-4 py-3 text-sm text-slate-800">
            Open the free signing lab in another tab if you need help checking your sign, then return here and submit the result.
          </p>
        ) : null}
        <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" type="submit">
          Submit Answer
        </button>
      </form>
    );
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Student LMS</p>
            <h2 className="mt-3 text-3xl font-bold title-gradient">{currentModule?.title ?? "Module Player"}</h2>
            <p className="mt-2 text-sm text-slate-700">
              Finish each item in order. Locked items open automatically after you complete the current one.
            </p>
          </div>
          <Link className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue" href="/modules">
            Back to Modules
          </Link>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}
      {message ? <p className="rounded-xl border border-brandGreen/35 bg-brandGreenLight px-4 py-3 text-sm text-slate-800">{message}</p> : null}

      {currentModule ? (
        <div className="grid gap-4 xl:grid-cols-[0.36fr_0.64fr]">
          <aside className="panel">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] label-accent">Course Flow</p>
            <div className="mt-4 space-y-3">
              {(course?.modules ?? []).map((module) => (
                <div className={`rounded-2xl border p-3 ${module.id === currentModule.id ? "border-brandBlue bg-brandBlueLight/60" : "border-brandBorder bg-white"}`} key={module.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Module {module.order_index}</p>
                      <p className="mt-1 font-semibold text-slate-900">{module.title}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${module.is_locked ? "bg-brandRedLight text-brandRed" : "bg-brandGreenLight text-brandGreen"}`}>
                      {module.is_locked ? "Locked" : `${module.progress_percent}%`}
                    </span>
                  </div>
                  {module.id === currentModule.id ? (
                    <div className="mt-3 space-y-2">
                      {module.items.map((item) => (
                        <button
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${item.is_locked ? "cursor-not-allowed border-brandBorder bg-brandMutedSurface text-slate-500" : item.status === "completed" ? "border-brandGreen/30 bg-brandGreenLight text-slate-800 hover:border-brandGreen/60" : "border-brandBlue/25 bg-white text-slate-800 hover:border-brandBlue/60"} ${currentItem?.id === item.id ? "ring-2 ring-brandBlue/30" : ""}`}
                          disabled={item.is_locked}
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span>{item.order_index}. {item.title}</span>
                            <span className="text-xs uppercase tracking-[0.15em]">
                              {item.is_locked ? "Locked" : item.status}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>

          <div className="panel">
            {currentItem ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] label-accent">
                  Item {currentItem.order_index} - {currentItem.item_type.replaceAll("_", " ")}
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">{currentItem.title}</h3>
                <p className="mt-2 text-sm text-slate-700">
                  {currentItem.instructions || "Complete this item to unlock the next part of the module."}
                </p>
                <div className="mt-6">{renderItem(currentItem)}</div>
                <div className="mt-8 flex flex-wrap gap-2 border-t border-brandBorder pt-5">
                  <button
                    className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!previousItem}
                    onClick={() => setSelectedItemId(previousItem?.id ?? null)}
                    type="button"
                  >
                    Previous Topic
                  </button>
                  <button
                    className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!nextItem}
                    onClick={() => setSelectedItemId(nextItem?.id ?? null)}
                    type="button"
                  >
                    Next Topic
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-700">No available learning item.</p>
            )}

            {certificateStatus?.eligible ? (
              <div className="mt-6 rounded-2xl border border-brandGreen/30 bg-brandGreenLight px-4 py-4 text-sm text-slate-800">
                Certificate requirements are complete. Open the profile or download route to get your certificate.
              </div>
            ) : null}

            {showCompleteAction && currentItem ? (
              <div className="mt-8 border-t border-brandBorder pt-5">
                <p className="mb-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                  End of Module Item
                </p>
                <button
                  className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => void onCompleteReadable(currentItem)}
                  type="button"
                >
                  Mark as Complete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
