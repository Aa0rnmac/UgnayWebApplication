"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { SigningLab } from "@/components/lab/signing-lab";

import {
  completeReadableItem,
  getStudentCertificateDownloadStatus,
  getStudentCourse,
  type NumbersCategory,
  type RecognitionMode,
  type ModuleAsset,
  resolveUploadsBase,
  submitStudentItem,
  uploadStudentItemSubmission,
  type StudentCertificateDownloadStatus,
  type StudentCourse,
  type StudentCourseItem,
  type StudentCourseModule,
  type WordsCategory
} from "@/lib/api";

const CONTENT_ITEM_TYPES = new Set([
  "readable",
  "video_resource",
  "document_resource",
  "interactive_resource",
  "external_link_resource"
]);

const NUMBER_CATEGORY_VALUES: NumbersCategory[] = [
  "0-10",
  "11-20",
  "21-30",
  "31-40",
  "41-50",
  "51-60",
  "61-70",
  "71-80",
  "81-90",
  "91-100",
];

const WORD_CATEGORY_VALUES: WordsCategory[] = [
  "greeting",
  "responses",
  "date",
  "family",
  "relationship",
  "color",
];

const SIGNING_ANSWER_NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Tab",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "Escape",
]);

function handleSigningAnswerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Backspace" || event.key === " ") {
    return;
  }
  if (event.key === "Delete" || SIGNING_ANSWER_NAV_KEYS.has(event.key)) {
    return;
  }
  if ((event.ctrlKey || event.metaKey) && ["a", "c", "x"].includes(event.key.toLowerCase())) {
    return;
  }
  event.preventDefault();
}

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

function parseRecognitionModeValue(value: unknown): RecognitionMode {
  return value === "numbers" || value === "words" ? value : "alphabet";
}

function parseNumbersCategoryValue(value: unknown): NumbersCategory | undefined {
  return NUMBER_CATEGORY_VALUES.includes(value as NumbersCategory)
    ? (value as NumbersCategory)
    : undefined;
}

function parseWordsCategoryValue(value: unknown): WordsCategory | undefined {
  return WORD_CATEGORY_VALUES.includes(value as WordsCategory)
    ? (value as WordsCategory)
    : undefined;
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

function getMcqQuestionPromptAsset(
  attachments: ModuleAsset[],
  questionKey: string,
  questionIndex: number
): ModuleAsset | null {
  return getQuestionPromptAsset(attachments, questionKey, questionIndex, "mcq");
}

function identificationQuestionAssetLabel(questionKey: string): string {
  return `identification-question:${questionKey}`;
}

function getQuestionPromptAsset(
  attachments: ModuleAsset[],
  questionKey: string,
  questionIndex: number,
  type: "mcq" | "identification"
): ModuleAsset | null {
  const normalizedKey = questionKey.trim().toLowerCase();
  const prefixes =
    type === "mcq"
      ? ["mcq-question:", "mcq_question:", "mcq:"]
      : ["identification-question:", "identification_question:", "identification:", "id-question:", "id_question:"];
  const exactTargets = new Set(prefixes.map((prefix) => `${prefix}${normalizedKey}`));

  for (let index = attachments.length - 1; index >= 0; index -= 1) {
    const label = (attachments[index]?.label ?? "").trim().toLowerCase();
    if (label && (exactTargets.has(label) || label === normalizedKey)) {
      return attachments[index] ?? null;
    }
  }

  const prefixedAttachments = attachments.filter((asset) => {
    const label = (asset.label ?? "").trim().toLowerCase();
    return label && prefixes.some((prefix) => label.startsWith(prefix));
  });
  if (prefixedAttachments[questionIndex]) {
    return prefixedAttachments[questionIndex] ?? null;
  }

  const unlabeledVisualAttachments = attachments.filter((asset) => {
    const label = (asset.label ?? "").trim();
    return !label && (asset.resource_kind === "image" || asset.resource_kind === "video");
  });
  return unlabeledVisualAttachments[questionIndex] ?? null;
}

function getIdentificationQuestionPromptAsset(
  attachments: ModuleAsset[],
  questionKey: string,
  questionIndex: number
): ModuleAsset | null {
  return getQuestionPromptAsset(attachments, questionKey, questionIndex, "identification");
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

type IdentificationQuestionConfig = {
  question_key: string;
  question: string;
};

type SigningLabEntryConfig = {
  question_key: string;
  question: string;
  correct_answer: string;
};

type AssessmentSubmissionState = {
  scorePercent: number | null;
  awaitingMarkDone: boolean;
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

function getIdentificationQuestionSet(item: StudentCourseItem): IdentificationQuestionConfig[] {
  const rawQuestionSet = item.config.questions;
  if (Array.isArray(rawQuestionSet) && rawQuestionSet.length > 0) {
    const parsed = rawQuestionSet
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const question = typeof row.question === "string" ? row.question.trim() : "";
        const questionKey =
          typeof row.question_key === "string" && row.question_key.trim()
            ? row.question_key.trim()
            : `q${index + 1}`;
        if (!question) {
          return null;
        }
        return {
          question_key: questionKey,
          question,
        };
      })
      .filter((entry): entry is IdentificationQuestionConfig => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const question = typeof item.config.question === "string" ? item.config.question.trim() : "";
  if (question) {
    return [{ question_key: "q1", question }];
  }
  return [];
}

function parseRequiredCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const asInt = Math.trunc(value);
    return asInt > 0 ? asInt : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function parseBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}

function getSigningLabEntrySet(item: StudentCourseItem): SigningLabEntryConfig[] {
  const rawQuestionSet = item.config.questions;
  if (Array.isArray(rawQuestionSet) && rawQuestionSet.length > 0) {
    const parsed = rawQuestionSet
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const question = typeof row.question === "string" ? row.question.trim() : "";
        const correctAnswer = typeof row.correct_answer === "string" ? row.correct_answer.trim() : "";
        const questionKey =
          typeof row.question_key === "string" && row.question_key.trim()
            ? row.question_key.trim()
            : `q${index + 1}`;
        if (!question && !correctAnswer) {
          return null;
        }
        return {
          question_key: questionKey,
          question,
          correct_answer: correctAnswer,
        };
      })
      .filter((entry): entry is SigningLabEntryConfig => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }
  const legacyQuestion = typeof item.config.question === "string" ? item.config.question.trim() : "";
  const legacyExpected =
    typeof item.config.expected_answer === "string" ? item.config.expected_answer.trim() : "";
  if (legacyQuestion || legacyExpected) {
    return [{ question_key: "q1", question: legacyQuestion, correct_answer: legacyExpected }];
  }
  return [];
}

function getSigningLabRequirement(item: StudentCourseItem, totalEntries: number): {
  requireAll: boolean;
  requiredCount: number;
} {
  const defaultRequired = Math.max(1, totalEntries);
  const requireAll = parseBooleanFlag(item.config.require_all) ?? true;
  const parsedRequired = parseRequiredCount(item.config.required_count);
  if (requireAll) {
    return {
      requireAll: true,
      requiredCount: defaultRequired,
    };
  }
  return {
    requireAll: false,
    requiredCount: Math.max(1, Math.min(parsedRequired ?? defaultRequired, defaultRequired)),
  };
}

export default function StudentModulePlayerPage() {
  const params = useParams<{ moduleId: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<StudentCourse | null>(null);
  const [certificateStatus, setCertificateStatus] = useState<StudentCertificateDownloadStatus | null>(null);
  const [answerByItem, setAnswerByItem] = useState<Record<number, string>>({});
  const [uploadFilesByItem, setUploadFilesByItem] = useState<Record<number, File[]>>({});
  const [uploadNoteByItem, setUploadNoteByItem] = useState<Record<number, string>>({});
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);
  const [mcqAnswersByItem, setMcqAnswersByItem] = useState<Record<number, Record<string, string>>>({});
  const [identificationAnswersByItem, setIdentificationAnswersByItem] = useState<
    Record<number, Record<string, string>>
  >({});
  const [signingLabAnswersByItem, setSigningLabAnswersByItem] = useState<
    Record<number, Record<string, string>>
  >({});
  const [signingLabEntryIndexByItem, setSigningLabEntryIndexByItem] = useState<Record<number, number>>({});
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [slideshowIndexByItem, setSlideshowIndexByItem] = useState<Record<number, number>>({});
  const [assessmentSubmissionStateByItem, setAssessmentSubmissionStateByItem] = useState<
    Record<number, AssessmentSubmissionState>
  >({});
  const [submittingAssessmentItemId, setSubmittingAssessmentItemId] = useState<number | null>(null);
  const [isCourseFlowCollapsed, setIsCourseFlowCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const itemPanelRef = useRef<HTMLDivElement | null>(null);

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
  const isAwaitingAssessmentMarkDone = Boolean(
    currentItem && assessmentSubmissionStateByItem[currentItem.id]?.awaitingMarkDone
  );
  const isCurrentModuleFinished = Boolean(
    currentModule &&
      currentModule.items.length > 0 &&
      currentModule.items.every((item) => item.status === "completed")
  );

  const showCompleteAction = Boolean(
    currentItem &&
      !currentItem.is_locked &&
      currentItem.status !== "completed" &&
      isContentItemType(currentItem.item_type)
  );

  useEffect(() => {
    if (!currentItem) {
      return;
    }
    const timer = window.setTimeout(() => {
      itemPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [currentItem?.id]);

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
      setSubmittingAssessmentItemId(item.id);
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
      if (item.item_type === "identification_assessment") {
        const questionSet = getIdentificationQuestionSet(item);
        if (questionSet.length > 1) {
          const questionAnswers = identificationAnswersByItem[item.id] ?? {};
          const hasMissingAnswer = questionSet.some(
            (question) => !(questionAnswers[question.question_key] ?? "").trim()
          );
          if (hasMissingAnswer) {
            setError("Please type an answer for all identification questions before submitting.");
            return;
          }
          responseText = "multi-identification-submission";
          extraPayload.question_answers = questionAnswers;
          extraPayload.question_total = questionSet.length;
        }
      }
      if (item.item_type === "signing_lab_assessment") {
        const entrySet = getSigningLabEntrySet(item);
        if (entrySet.length > 1) {
          const answerMap = signingLabAnswersByItem[item.id] ?? {};
          const { requiredCount } = getSigningLabRequirement(item, entrySet.length);
          const answeredCount = entrySet.reduce((total, entry) => {
            return (answerMap[entry.question_key] ?? "").trim() ? total + 1 : total;
          }, 0);
          if (answeredCount < requiredCount) {
            setError(
              `Please answer at least ${requiredCount} camera entries before submitting.`
            );
            return;
          }
          responseText = "multi-signing-submission";
          extraPayload.question_answers = answerMap;
          extraPayload.question_total = entrySet.length;
          extraPayload.required_count = requiredCount;
        }
      }
      if (!responseText.trim()) {
        setError("Please provide an answer before submitting.");
        return;
      }
      const submission = await submitStudentItem(item.id, {
        response_text: responseText,
        duration_seconds: 60,
        score_percent: undefined,
        extra_payload: extraPayload
      });
      setAssessmentSubmissionStateByItem((current) => ({
        ...current,
        [item.id]: {
          scorePercent:
            typeof submission.score_percent === "number" ? submission.score_percent : null,
          awaitingMarkDone: true,
        },
      }));
      setMessage("Answer submitted. Review your score, retake if needed, then click Mark as Done.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit item.");
    } finally {
      setSubmittingAssessmentItemId((current) => (current === item.id ? null : current));
    }
  }

  async function onMarkAssessmentDone(item: StudentCourseItem) {
    try {
      setError(null);
      await refresh({ tolerateCertificateError: true });
      setAssessmentSubmissionStateByItem((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setMessage("Marked as done. You can now proceed to the next item.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to mark assessment as done."
      );
    }
  }

  function onFinishModule() {
    if (!course || !currentModule) {
      return;
    }
    const nextUnlockedModule = course.modules.find(
      (module) => module.order_index > currentModule.order_index && !module.is_locked
    );
    if (nextUnlockedModule) {
      router.push(`/modules/${nextUnlockedModule.id}`);
      return;
    }
    router.push("/modules");
  }

  async function onUploadSubmission(event: FormEvent<HTMLFormElement>, item: StudentCourseItem) {
    event.preventDefault();
    const files = uploadFilesByItem[item.id] ?? [];
    if (files.length === 0) {
      setError("Please add at least one file or video before submitting.");
      return;
    }
    try {
      setError(null);
      setUploadingItemId(item.id);
      await uploadStudentItemSubmission(item.id, {
        files,
        note: uploadNoteByItem[item.id] ?? "",
        duration_seconds: 60,
      });
      setMessage("Your work was uploaded. Teacher can now review and score it.");
      setUploadFilesByItem((current) => ({ ...current, [item.id]: [] }));
      setSelectedItemId(null);
      await refresh({ tolerateCertificateError: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to upload your submission."
      );
    } finally {
      setUploadingItemId(null);
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

    if (item.item_type === "upload_assessment") {
      const selectedFiles = uploadFilesByItem[item.id] ?? [];
      const maxPointsRaw = item.config.max_points;
      const maxPoints =
        typeof maxPointsRaw === "number"
          ? maxPointsRaw
          : typeof maxPointsRaw === "string"
            ? Number.parseFloat(maxPointsRaw)
            : 100;
      const rubric =
        typeof item.config.rubric_text === "string" && item.config.rubric_text.trim()
          ? item.config.rubric_text
          : "No rubric provided yet.";
      return (
        <form className="space-y-4" onSubmit={(event) => void onUploadSubmission(event, item)}>
          <p className="rounded-xl bg-brandOffWhite px-4 py-4 text-sm leading-7 text-slate-700">
            {item.instructions ||
              "Upload your video or file output for this assessment. Your teacher will score it manually."}
          </p>
          <div className="rounded-2xl border border-brandBorder bg-white p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  Add Your Work (video/file)
                </label>
                <input
                  accept="video/*,image/*,.pdf,.ppt,.pptx,.doc,.docx,.txt"
                  className="form-control"
                  multiple
                  onChange={(event) =>
                    setUploadFilesByItem((current) => ({
                      ...current,
                      [item.id]: Array.from(event.target.files ?? []),
                    }))
                  }
                  type="file"
                />
                {selectedFiles.length > 0 ? (
                  <ul className="mt-3 mb-0 list-unstyled small text-slate-700">
                    {selectedFiles.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${index}`}>
                        {index + 1}. {file.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 mb-0 small text-slate-600">No file selected yet.</p>
                )}
              </div>
              <aside className="rounded-2xl border border-brandBorder bg-brandOffWhite p-3">
                <p className="mb-1 text-xs uppercase tracking-[0.16em] text-slate-500">Rubrics</p>
                <p className="mb-3 text-sm text-slate-700">{rubric}</p>
                <p className="mb-0 text-sm text-slate-700">
                  Max Points: <span className="font-semibold">{Number.isFinite(maxPoints) ? maxPoints : 100}</span>
                </p>
              </aside>
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Private Note to Teacher (optional)
              </label>
              <textarea
                className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                onChange={(event) =>
                  setUploadNoteByItem((current) => ({
                    ...current,
                    [item.id]: event.target.value,
                  }))
                }
                rows={3}
                value={uploadNoteByItem[item.id] ?? ""}
              />
            </div>
          </div>
          <button
            className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={uploadingItemId === item.id}
            type="submit"
          >
            {uploadingItemId === item.id ? "Uploading..." : item.status === "completed" ? "Resubmit Work" : "Submit Work"}
          </button>
        </form>
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
    const identificationQuestionSet =
      item.item_type === "identification_assessment" ? getIdentificationQuestionSet(item) : [];
    const signingLabEntrySet =
      item.item_type === "signing_lab_assessment" ? getSigningLabEntrySet(item) : [];
    const signingLabRequirement =
      item.item_type === "signing_lab_assessment"
        ? getSigningLabRequirement(item, signingLabEntrySet.length)
        : null;
    const signingLabRequirementText =
      signingLabRequirement && signingLabEntrySet.length > 0
        ? signingLabRequirement.requireAll
          ? `You must answer all ${signingLabEntrySet.length} entries before submitting.`
          : `You must answer at least ${signingLabRequirement.requiredCount} of ${signingLabEntrySet.length} entries before submitting.`
        : undefined;
    const isMultiQuestionMcq =
      item.item_type === "multiple_choice_assessment" && mcqQuestionSet.length > 1;
    const isMultiQuestionIdentification =
      item.item_type === "identification_assessment" && identificationQuestionSet.length > 1;
    const isMultiEntrySigningLab =
      item.item_type === "signing_lab_assessment" && signingLabEntrySet.length > 1;
    const multiAnswers = mcqAnswersByItem[item.id] ?? {};
    const identificationAnswers = identificationAnswersByItem[item.id] ?? {};
    const signingLabAnswers = signingLabAnswersByItem[item.id] ?? {};
    const rawSigningEntryIndex = signingLabEntryIndexByItem[item.id] ?? 0;
    const currentSigningEntryIndex =
      signingLabEntrySet.length > 0
        ? Math.min(Math.max(rawSigningEntryIndex, 0), signingLabEntrySet.length - 1)
        : 0;
    const currentSigningEntry = signingLabEntrySet[currentSigningEntryIndex] ?? null;
    const answeredSigningEntries = signingLabEntrySet.reduce((total, entry) => {
      return (signingLabAnswers[entry.question_key] ?? "").trim() ? total + 1 : total;
    }, 0);
    const singleSigningEntry = signingLabEntrySet[0] ?? null;
    const hasQuestionPrompt =
      item.item_type === "multiple_choice_assessment" &&
      mcqQuestionSet.some((entry, index) =>
        Boolean(getMcqQuestionPromptAsset(attachments, entry.question_key, index))
      );
    const hasIdentificationQuestionPrompt =
      item.item_type === "identification_assessment" &&
      identificationQuestionSet.some((entry, index) =>
        Boolean(getIdentificationQuestionPromptAsset(attachments, entry.question_key, index))
      );
    const singleQuestionPrompt =
      item.item_type === "multiple_choice_assessment"
        ? getMcqQuestionPromptAsset(
            attachments,
            mcqQuestionSet[0]?.question_key ?? "q1",
            0
          ) || promptMedia
        : null;
    const singleIdentificationPrompt =
      item.item_type === "identification_assessment"
        ? getIdentificationQuestionPromptAsset(
            attachments,
            identificationQuestionSet[0]?.question_key ?? "q1",
            0
          ) || promptMedia
        : null;
    const preferredLabMode =
      item.item_type === "signing_lab_assessment"
        ? parseRecognitionModeValue(item.config.lab_mode)
        : "alphabet";
    const preferredNumbersCategory =
      item.item_type === "signing_lab_assessment"
        ? parseNumbersCategoryValue(item.config.numbers_category)
        : undefined;
    const preferredWordsCategory =
      item.item_type === "signing_lab_assessment"
        ? parseWordsCategoryValue(item.config.words_category)
        : undefined;
    const signingLabPanelContent =
      item.item_type === "signing_lab_assessment" ? (
        <div className="space-y-3">
          {isMultiEntrySigningLab ? (
            <div className="rounded-3 border border-brandBorder bg-brandOffWhite p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="mb-0 text-sm font-semibold text-slate-800">
                  Entry {currentSigningEntryIndex + 1} of {signingLabEntrySet.length}
                </p>
                <span className="rounded-full bg-brandBlueLight px-2 py-1 text-xs font-semibold text-brandBlue">
                  Answered {answeredSigningEntries}/{signingLabEntrySet.length}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  disabled={currentSigningEntryIndex <= 0}
                  onClick={() =>
                    setSigningLabEntryIndexByItem((current) => ({
                      ...current,
                      [item.id]: Math.max((current[item.id] ?? 0) - 1, 0),
                    }))
                  }
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  disabled={currentSigningEntryIndex >= signingLabEntrySet.length - 1}
                  onClick={() =>
                    setSigningLabEntryIndexByItem((current) => ({
                      ...current,
                      [item.id]: Math.min(
                        (current[item.id] ?? 0) + 1,
                        signingLabEntrySet.length - 1
                      ),
                    }))
                  }
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          {(isMultiEntrySigningLab && currentSigningEntry) || (!isMultiEntrySigningLab) ? (
            <div className="rounded-3 border border-brandBorder bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">
                {isMultiEntrySigningLab
                  ? currentSigningEntry?.question || "No prompt for this entry yet."
                  : singleSigningEntry?.question || "Type your detected sign result below."}
              </p>
              <input
                className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                onChange={(event) => {
                  if (isMultiEntrySigningLab && currentSigningEntry) {
                    setSigningLabAnswersByItem((current) => ({
                      ...current,
                      [item.id]: {
                        ...(current[item.id] ?? {}),
                        [currentSigningEntry.question_key]: event.target.value,
                      },
                    }));
                    return;
                  }
                  setAnswerByItem((current) => ({ ...current, [item.id]: event.target.value }));
                }}
                onDrop={(event) => event.preventDefault()}
                onKeyDown={handleSigningAnswerKeyDown}
                onPaste={(event) => event.preventDefault()}
                placeholder="Type the detected sign result here."
                value={
                  isMultiEntrySigningLab && currentSigningEntry
                    ? signingLabAnswers[currentSigningEntry.question_key] ?? ""
                    : answerByItem[item.id] ?? ""
                }
              />
            </div>
          ) : null}

          <p className="mb-0 rounded-xl border border-brandRed/35 bg-brandRedLight px-3 py-2 text-xs font-semibold text-brandRed">
            Click <span className="font-semibold">Start Camera</span> first, then click{" "}
            <span className="font-semibold">Analyze Sign Now</span> to analyze the gesture.
          </p>
        </div>
      ) : null;
    const embeddedSigningLab =
      item.item_type === "signing_lab_assessment" ? (
        <div className="rounded-2xl border border-brandBorder bg-white p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Camera Interface</p>
          <SigningLab
            embedded
            embeddedPanelContent={signingLabPanelContent}
            key={`${item.id}-${preferredLabMode}-${preferredNumbersCategory ?? ""}-${preferredWordsCategory ?? ""}`}
            statusOverride={signingLabRequirementText}
            onPredictionDetected={(detectedValue) => {
              if (isMultiEntrySigningLab && currentSigningEntry) {
                setSigningLabAnswersByItem((current) => ({
                  ...current,
                  [item.id]: {
                    ...(current[item.id] ?? {}),
                    [currentSigningEntry.question_key]: detectedValue,
                  },
                }));
                return;
              }
              setAnswerByItem((current) => ({ ...current, [item.id]: detectedValue }));
            }}
            preferredMode={preferredLabMode}
            preferredNumbersCategory={preferredNumbersCategory}
            preferredWordsCategory={preferredWordsCategory}
            variant="student"
          />
        </div>
      ) : null;
    const submissionState = assessmentSubmissionStateByItem[item.id];
    const awaitingMarkDone = submissionState?.awaitingMarkDone ?? false;
    const latestScorePercent =
      typeof submissionState?.scorePercent === "number"
        ? submissionState.scorePercent
        : typeof item.score_percent === "number"
          ? item.score_percent
          : null;

    return (
      <form className="space-y-4" onSubmit={(event) => void onSubmitItem(event, item)}>
        {item.item_type === "multiple_choice_assessment" && isMultiQuestionMcq ? (
          <div className="space-y-3">
            {promptMedia && !hasQuestionPrompt ? (
              <div className="rounded-xl border border-brandBorder bg-white p-3">
                {renderReadableAsset(promptMedia)}
              </div>
            ) : null}
            {mcqQuestionSet.map((entry, questionIndex) => {
              const questionPrompt = getMcqQuestionPromptAsset(
                attachments,
                entry.question_key,
                questionIndex
              );
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
        ) : item.item_type === "identification_assessment" && isMultiQuestionIdentification ? (
          <div className="space-y-3">
            {promptMedia && !hasIdentificationQuestionPrompt ? (
              <div className="rounded-xl border border-brandBorder bg-white p-3">
                {renderReadableAsset(promptMedia)}
              </div>
            ) : null}
            {identificationQuestionSet.map((entry, questionIndex) => {
              const questionPrompt = getIdentificationQuestionPromptAsset(
                attachments,
                entry.question_key,
                questionIndex
              );
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
                  <input
                    className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                    onChange={(event) =>
                      setIdentificationAnswersByItem((current) => ({
                        ...current,
                        [item.id]: {
                          ...(current[item.id] ?? {}),
                          [entry.question_key]: event.target.value,
                        },
                      }))
                    }
                    placeholder="Type your answer here."
                    value={identificationAnswers[entry.question_key] ?? ""}
                  />
                </div>
              );
            })}
          </div>
        ) : item.item_type === "signing_lab_assessment" && isMultiEntrySigningLab ? (
          <div className="space-y-3">
            {embeddedSigningLab}
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
        ) : item.item_type === "identification_assessment" ? (
          <div className="space-y-3">
            {singleIdentificationPrompt ? (
              <div className="rounded-xl border border-brandBorder bg-white p-3">
                {renderReadableAsset(singleIdentificationPrompt)}
              </div>
            ) : null}
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => setAnswerByItem((current) => ({ ...current, [item.id]: event.target.value }))}
              placeholder="Type your answer here."
              value={answerByItem[item.id] ?? ""}
            />
          </div>
        ) : item.item_type === "signing_lab_assessment" ? (
          <div className="space-y-3">
            {embeddedSigningLab}
          </div>
        ) : (
          <input
            className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setAnswerByItem((current) => ({ ...current, [item.id]: event.target.value }))}
            placeholder="Type your answer here."
            value={answerByItem[item.id] ?? ""}
          />
        )}
        {item.item_type === "signing_lab_assessment" ? (
          <div className="space-y-2">
            {String(item.config.lab_mode || "").toLowerCase() === "words" ? (
              <p className="mb-0 rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm font-semibold text-brandRed">
                Use English answers for words assessment.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submittingAssessmentItemId === item.id}
            type="submit"
          >
            {submittingAssessmentItemId === item.id
              ? "Submitting..."
              : awaitingMarkDone
                ? "Submit Retake"
                : "Submit Answer"}
          </button>
          {awaitingMarkDone ? (
            <>
              <button
                className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={() =>
                  setMessage("You can change your answer and click Submit Retake.")
                }
                type="button"
              >
                Retake
              </button>
              <button
                className="rounded-lg bg-brandGreen px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void onMarkAssessmentDone(item)}
                type="button"
              >
                Mark as Done
              </button>
            </>
          ) : null}
        </div>
        {(awaitingMarkDone || latestScorePercent !== null) ? (
          <div className="rounded-xl border border-brandGreen/35 bg-brandGreenLight px-4 py-3 text-sm text-slate-800">
            <p className="mb-1 font-semibold">
              Score: {latestScorePercent !== null ? `${latestScorePercent.toFixed(1)}%` : "Pending"}
            </p>
            {awaitingMarkDone ? (
              <p className="mb-0">Retake if needed, then click Mark as Done to continue.</p>
            ) : (
              <p className="mb-0">Latest submitted score.</p>
            )}
          </div>
        ) : null}
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
            <p className="mt-2 text-xs text-slate-600">
              Instructor:{" "}
              <span className="font-semibold">
                {currentModule?.instructor_name?.trim() || "Unknown Instructor"}
              </span>
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Finish each item in order. Locked items open automatically after you complete the current one.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={() => setIsCourseFlowCollapsed((current) => !current)}
              type="button"
            >
              {isCourseFlowCollapsed ? "Show Course Flow" : "Hide Course Flow"}
            </button>
            <Link className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue" href="/modules">
              Back to Modules
            </Link>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}
      {message ? <p className="rounded-xl border border-brandGreen/35 bg-brandGreenLight px-4 py-3 text-sm text-slate-800">{message}</p> : null}

      {currentModule ? (
        <div className={`grid gap-4 ${isCourseFlowCollapsed ? "grid-cols-1" : "xl:grid-cols-[0.36fr_0.64fr]"}`}>
          {!isCourseFlowCollapsed ? (
            <aside className="panel">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] label-accent">Course Flow</p>
              <div className="mt-4 space-y-3">
                {(course?.modules ?? []).map((module) => (
                  <div className={`rounded-2xl border p-3 ${module.id === currentModule.id ? "border-brandBlue bg-brandBlueLight/60" : "border-brandBorder bg-white"}`} key={module.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Module {module.order_index}</p>
                        {module.id !== currentModule.id && !module.is_locked ? (
                          <button
                            className="mt-1 border-0 bg-transparent p-0 text-left font-semibold text-brandBlue text-decoration-underline"
                            onClick={() => router.push(`/modules/${module.id}`)}
                            type="button"
                          >
                            {module.title}
                          </button>
                        ) : (
                          <p className="mt-1 font-semibold text-slate-900">{module.title}</p>
                        )}
                        <p className="mt-1 mb-0 text-[11px] text-slate-600">
                          Instructor:{" "}
                          <span className="font-semibold">
                            {module.instructor_name?.trim() || "Unknown Instructor"}
                          </span>
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${module.is_locked ? "bg-brandRedLight text-brandRed" : "bg-brandGreenLight text-brandGreen"}`}>
                        {module.is_locked ? "Locked" : `${module.progress_percent}%`}
                      </span>
                    </div>
                    {module.id === currentModule.id ? (
                      <div className="mt-3 space-y-2">
                        {module.items.map((item) => (
                          <button
                            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                              item.is_locked || (isAwaitingAssessmentMarkDone && currentItem && item.order_index > currentItem.order_index)
                                ? "cursor-not-allowed border-brandBorder bg-brandMutedSurface text-slate-500"
                                : item.status === "completed"
                                  ? "border-brandGreen/30 bg-brandGreenLight text-slate-800 hover:border-brandGreen/60"
                                  : "border-brandBlue/25 bg-white text-slate-800 hover:border-brandBlue/60"
                            } ${currentItem?.id === item.id ? "ring-2 ring-brandBlue/30" : ""}`}
                            disabled={item.is_locked || (isAwaitingAssessmentMarkDone && currentItem ? item.order_index > currentItem.order_index : false)}
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
          ) : null}

          <div className="panel" ref={itemPanelRef}>
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
                    disabled={!nextItem || isAwaitingAssessmentMarkDone}
                    onClick={() => setSelectedItemId(nextItem?.id ?? null)}
                    type="button"
                  >
                    Next Topic
                  </button>
                  {!nextItem && !isAwaitingAssessmentMarkDone && isCurrentModuleFinished ? (
                    <button
                      className="rounded-lg bg-brandGreen px-4 py-2 text-sm font-semibold text-white"
                      onClick={onFinishModule}
                      type="button"
                    >
                      Finish Module
                    </button>
                  ) : null}
                </div>
                {isAwaitingAssessmentMarkDone ? (
                  <p className="mt-3 rounded-xl border border-brandYellow/35 bg-brandYellowLight px-4 py-3 text-sm text-slate-800">
                    Click Mark as Done to unlock and open the next topic.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-700">No available learning item.</p>
            )}

            {certificateStatus?.eligible ? (
              <div className="mt-6 rounded-2xl border border-brandGreen/30 bg-brandGreenLight px-4 py-4 text-sm text-slate-800">
                Certificate requirements are complete. Go back to the modules list and download your e-certificate.
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
