"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-context";

import {
  createTeacherModuleItem,
  createTeacherSectionModule,
  deleteTeacherModule,
  deleteTeacherModuleItem,
  getTeacherModuleUploadAssessments,
  getTeacherSection,
  getTeacherSectionModules,
  getTeacherSections,
  getTeacherUploadAssessmentSubmissions,
  gradeTeacherModuleSubmission,
  type NumbersCategory,
  type RecognitionMode,
  resolveUploadsBase,
  type TeacherModuleSubmission,
  type TeacherUploadAssessmentSummary,
  updateTeacherModuleItem,
  updateTeacherModule,
  uploadTeacherModuleItemAsset,
  type LmsModuleItem,
  type LmsSection,
  type ModuleAsset,
  type TeacherSectionModule,
  type TeacherSectionSummary,
  type WordsCategory
} from "@/lib/api";
import { notifyInfo, notifySuccess } from "@/lib/notify";

const ITEM_TYPE_OPTIONS = [
  { value: "readable", label: "Learning Materials" },
  { value: "multiple_choice_assessment", label: "Multiple Choice" },
  { value: "identification_assessment", label: "Identification" },
  { value: "signing_lab_assessment", label: "Camera Interface" },
  { value: "upload_assessment", label: "Upload Assessment" }
] as const;

type BuilderItemType = (typeof ITEM_TYPE_OPTIONS)[number]["value"];

function normalizeBuilderItemType(value: string): BuilderItemType {
  return ITEM_TYPE_OPTIONS.some((entry) => entry.value === value)
    ? (value as BuilderItemType)
    : "readable";
}

const READABLE_ACCEPT = [
  "video/*",
  "image/*",
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".zip"
].join(",");

const IDENTIFICATION_PROMPT_ACCEPT = ["image/*", "video/*"].join(",");
const MCQ_PROMPT_ACCEPT = ["image/*"].join(",");

const READABLE_PRESENTATION_OPTIONS = [
  { value: "auto", label: "No Selection (Auto)" },
  { value: "cards", label: "Cards Grid" },
  { value: "slideshow", label: "Slideshow" }
] as const;

type ReadablePresentationMode = (typeof READABLE_PRESENTATION_OPTIONS)[number]["value"];

const LAB_MODE_OPTIONS: Array<{ value: RecognitionMode; label: string }> = [
  { value: "alphabet", label: "Alphabets" },
  { value: "numbers", label: "Numbers" },
  { value: "words", label: "Words" }
];

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

function normalizeWords(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function displayType(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function displayItemTypeLabel(value: string): string {
  if (value === "readable") {
    return "Learning Materials";
  }
  return displayType(value);
}

type ReadableUploadEntry = {
  id: string;
  file: File;
  label: string;
};

type McqQuestionDraft = {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  promptFile: File | null;
};

type IdentificationQuestionDraft = {
  id: string;
  question: string;
  correctAnswer: string;
  acceptedAnswersText: string;
  promptFile: File | null;
};

type SigningLabEntryDraft = {
  id: string;
  prompt: string;
  expectedAnswer: string;
};

type UploadRubricDraft = {
  id: string;
  criterion: string;
  weightPercent: number;
};

function createMcqQuestionId() {
  return `mcq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMcqQuestionDraft(partial?: Partial<McqQuestionDraft>): McqQuestionDraft {
  const choices = Array.isArray(partial?.choices) ? partial.choices.map((choice) => choice ?? "") : [];
  const paddedChoices = [...choices];
  while (paddedChoices.length < 4) {
    paddedChoices.push("");
  }
  const normalizedCorrectIndex =
    typeof partial?.correctIndex === "number" && partial.correctIndex >= 0
      ? Math.min(partial.correctIndex, paddedChoices.length - 1)
      : 0;
  return {
    id: partial?.id ?? createMcqQuestionId(),
    question: partial?.question ?? "",
    choices: paddedChoices,
    correctIndex: normalizedCorrectIndex,
    promptFile: partial?.promptFile ?? null,
  };
}

function normalizeQuestionKey(value: string, index: number): string {
  const fallback = `q${index + 1}`;
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function mcqQuestionAssetLabel(questionKey: string): string {
  return `mcq-question:${questionKey}`;
}

function identificationQuestionAssetLabel(questionKey: string): string {
  return `identification-question:${questionKey}`;
}

function parseMcqQuestionDrafts(item: LmsModuleItem): McqQuestionDraft[] {
  const rawQuestionSet = item.config.questions;
  if (Array.isArray(rawQuestionSet) && rawQuestionSet.length > 0) {
    const parsed = rawQuestionSet
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const choices = Array.isArray(row.choices)
          ? (row.choices as unknown[]).map((value) => String(value))
          : [];
        const correctAnswer = typeof row.correct_answer === "string" ? row.correct_answer : "";
        const matchedIndex = choices.findIndex(
          (choice) => choice.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
        );
        return createMcqQuestionDraft({
          id: typeof row.question_key === "string" && row.question_key.trim()
            ? row.question_key.trim()
            : `q${index + 1}`,
          question: typeof row.question === "string" ? row.question : "",
          choices,
          correctIndex: matchedIndex >= 0 ? matchedIndex : 0,
        });
      })
      .filter((entry): entry is McqQuestionDraft => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const rawChoices = Array.isArray(item.config.choices)
    ? (item.config.choices as unknown[]).map((entry) => String(entry))
    : [];
  const correctAnswer = typeof item.config.correct_answer === "string" ? item.config.correct_answer : "";
  const matchedIndex = rawChoices.findIndex(
    (choice) => choice.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
  );
  return [
    createMcqQuestionDraft({
      id: "q1",
      question: typeof item.config.question === "string" ? item.config.question : "",
      choices: rawChoices,
      correctIndex: matchedIndex >= 0 ? matchedIndex : 0,
    }),
  ];
}

function createIdentificationQuestionDraft(
  partial?: Partial<IdentificationQuestionDraft>
): IdentificationQuestionDraft {
  return {
    id: partial?.id ?? createMcqQuestionId(),
    question: partial?.question ?? "",
    correctAnswer: partial?.correctAnswer ?? "",
    acceptedAnswersText: partial?.acceptedAnswersText ?? "",
    promptFile: partial?.promptFile ?? null,
  };
}

function parseIdentificationQuestionDrafts(item: LmsModuleItem): IdentificationQuestionDraft[] {
  const rawQuestionSet = item.config.questions;
  if (Array.isArray(rawQuestionSet) && rawQuestionSet.length > 0) {
    const parsed = rawQuestionSet
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const acceptedAnswers = Array.isArray(row.accepted_answers)
          ? (row.accepted_answers as unknown[]).map((value) => String(value)).filter(Boolean)
          : [];
        return createIdentificationQuestionDraft({
          id:
            typeof row.question_key === "string" && row.question_key.trim()
              ? row.question_key.trim()
              : `q${index + 1}`,
          question: typeof row.question === "string" ? row.question : "",
          correctAnswer: typeof row.correct_answer === "string" ? row.correct_answer : "",
          acceptedAnswersText: acceptedAnswers.join(", "),
        });
      })
      .filter((entry): entry is IdentificationQuestionDraft => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const acceptedAnswers = Array.isArray(item.config.accepted_answers)
    ? (item.config.accepted_answers as unknown[]).map((value) => String(value)).filter(Boolean)
    : [];
  return [
    createIdentificationQuestionDraft({
      id: "q1",
      question: typeof item.config.question === "string" ? item.config.question : "",
      correctAnswer: typeof item.config.correct_answer === "string" ? item.config.correct_answer : "",
      acceptedAnswersText: acceptedAnswers.join(", "),
    }),
  ];
}

function createSigningLabEntryDraft(partial?: Partial<SigningLabEntryDraft>): SigningLabEntryDraft {
  return {
    id: partial?.id ?? createMcqQuestionId(),
    prompt: partial?.prompt ?? "",
    expectedAnswer: partial?.expectedAnswer ?? "",
  };
}

function createUploadRubricDraft(partial?: Partial<UploadRubricDraft>): UploadRubricDraft {
  return {
    id: partial?.id ?? createMcqQuestionId(),
    criterion: partial?.criterion ?? "",
    weightPercent:
      typeof partial?.weightPercent === "number" && Number.isFinite(partial.weightPercent)
        ? Math.min(Math.max(partial.weightPercent, 0), 100)
        : 25,
  };
}

function parseSigningLabEntryDrafts(item: LmsModuleItem): SigningLabEntryDraft[] {
  const rawQuestionSet = item.config.questions;
  if (Array.isArray(rawQuestionSet) && rawQuestionSet.length > 0) {
    const parsed = rawQuestionSet
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const prompt = typeof row.question === "string" ? row.question : "";
        const expectedAnswer = typeof row.correct_answer === "string" ? row.correct_answer : "";
        return createSigningLabEntryDraft({
          id:
            typeof row.question_key === "string" && row.question_key.trim()
              ? row.question_key.trim()
              : `q${index + 1}`,
          prompt,
          expectedAnswer,
        });
      })
      .filter((entry): entry is SigningLabEntryDraft => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const legacyPrompt = typeof item.config.question === "string" ? item.config.question : "";
  const legacyExpected = typeof item.config.expected_answer === "string" ? item.config.expected_answer : "";
  return [createSigningLabEntryDraft({ id: "q1", prompt: legacyPrompt, expectedAnswer: legacyExpected })];
}

function parseUploadRubricDrafts(item: LmsModuleItem): UploadRubricDraft[] {
  const rawRubrics = item.config.rubric_items;
  if (Array.isArray(rawRubrics) && rawRubrics.length > 0) {
    const parsed = rawRubrics
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const row = entry as Record<string, unknown>;
        const criterion =
          typeof row.criterion === "string"
            ? row.criterion
            : typeof row.question === "string"
              ? row.question
              : "";
        const rawWeight =
          typeof row.weight_percent === "number"
            ? row.weight_percent
            : typeof row.weightPercent === "number"
              ? row.weightPercent
              : typeof row.weight_percent === "string"
                ? Number.parseFloat(row.weight_percent)
                : Number.NaN;
        const normalizedWeight = Number.isFinite(rawWeight)
          ? Math.min(Math.max(rawWeight, 0), 100)
          : 0;
        if (!criterion.trim()) {
          return null;
        }
        return createUploadRubricDraft({
          id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `rubric-${index + 1}`,
          criterion,
          weightPercent: normalizedWeight,
        });
      })
      .filter((entry): entry is UploadRubricDraft => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const rubricText = typeof item.config.rubric_text === "string" ? item.config.rubric_text : "";
  if (!rubricText.trim()) {
    return [createUploadRubricDraft({ id: "rubric-1", criterion: "", weightPercent: 25 })];
  }
  return rubricText
    .split(/\n+/g)
    .map((line, index) => line.trim())
    .filter(Boolean)
    .map((line, index, all) =>
      createUploadRubricDraft({
        id: `rubric-${index + 1}`,
        criterion: line,
        weightPercent: Number((100 / Math.max(1, all.length)).toFixed(2)),
      })
    );
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

function normalizeExternalLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function readConfigLink(config: Record<string, unknown>, key: string): string {
  const raw = config[key];
  return typeof raw === "string" ? normalizeExternalLink(raw) : "";
}

function buildReadableUploadId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
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
        typeof candidate.resource_mime_type === "string" ? candidate.resource_mime_type : undefined,
      resource_url: typeof candidate.resource_url === "string" ? candidate.resource_url : undefined,
      label: typeof candidate.label === "string" ? candidate.label : undefined
    };
  }
  return null;
}

function getItemAttachments(item: LmsModuleItem): ModuleAsset[] {
  const raw = item.config.attachments;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => parseAsset(entry)).filter((entry): entry is ModuleAsset => Boolean(entry));
}

function getPromptMedia(item: LmsModuleItem): ModuleAsset | null {
  return parseAsset(item.config.prompt_media);
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

function getIdentificationQuestionPromptAsset(
  attachments: ModuleAsset[],
  questionKey: string
): ModuleAsset | null {
  const targetLabel = identificationQuestionAssetLabel(questionKey).toLowerCase();
  for (let index = attachments.length - 1; index >= 0; index -= 1) {
    const label = (attachments[index]?.label ?? "").trim().toLowerCase();
    if (label === targetLabel) {
      return attachments[index] ?? null;
    }
  }
  return null;
}

function parseLabMode(value: unknown): RecognitionMode | null {
  return value === "alphabet" || value === "numbers" || value === "words" ? value : null;
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

function getSigningLabConfig(item: LmsModuleItem): {
  mode: RecognitionMode;
  numbersCategory: NumbersCategory | null;
  wordsCategory: WordsCategory | null;
  entries: Array<{ question_key: string; question: string; correct_answer: string }>;
  requiredCount: number;
  requireAll: boolean;
} | null {
  if (item.item_type !== "signing_lab_assessment") {
    return null;
  }
  const mode = parseLabMode(item.config.lab_mode) ?? "alphabet";
  const numbersCategory = parseNumbersCategory(item.config.numbers_category);
  const wordsCategory = parseWordsCategory(item.config.words_category);
  const rawQuestionSet = item.config.questions;
  const parsedEntries = Array.isArray(rawQuestionSet)
    ? rawQuestionSet
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
        .filter(
          (
            entry
          ): entry is { question_key: string; question: string; correct_answer: string } => Boolean(entry)
        )
    : [];
  const legacyQuestion = typeof item.config.question === "string" ? item.config.question.trim() : "";
  const legacyAnswer =
    typeof item.config.expected_answer === "string" ? item.config.expected_answer.trim() : "";
  const entries =
    parsedEntries.length > 0
      ? parsedEntries
      : legacyQuestion || legacyAnswer
        ? [{ question_key: "q1", question: legacyQuestion, correct_answer: legacyAnswer }]
        : [];
  const requireAll = parseBooleanFlag(item.config.require_all) ?? true;
  const rawRequiredCount = parseRequiredCount(item.config.required_count);
  const defaultRequiredCount = entries.length > 0 ? entries.length : 1;
  const requiredCount = requireAll
    ? defaultRequiredCount
    : Math.max(1, Math.min(rawRequiredCount ?? defaultRequiredCount, defaultRequiredCount));
  return { mode, numbersCategory, wordsCategory, entries, requiredCount, requireAll };
}

function displayNumbersRangeLabel(value: NumbersCategory | null): string {
  if (!value) {
    return "Not set";
  }
  return NUMBER_RANGE_OPTIONS.find((entry) => entry.value === value)?.label ?? value;
}

function displayWordsCategoryLabel(value: WordsCategory | null): string {
  if (!value) {
    return "Not set";
  }
  return WORD_CATEGORY_OPTIONS.find((entry) => entry.value === value)?.label ?? value;
}

function parseReadablePresentationMode(value: unknown): ReadablePresentationMode {
  if (value === "cards" || value === "slideshow") {
    return value;
  }
  return "auto";
}

function readableModeLabel(value: ReadablePresentationMode): string {
  if (value === "slideshow") {
    return "Slideshow";
  }
  if (value === "cards") {
    return "Cards Grid";
  }
  return "No Selection (Auto)";
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

type SubmissionRubricCriterion = {
  id: string;
  criterion: string;
  weight_percent: number;
};

function normalizeSubmissionRubricCriteria(
  submission: TeacherModuleSubmission
): SubmissionRubricCriterion[] {
  if (Array.isArray(submission.rubric_items) && submission.rubric_items.length > 0) {
    return submission.rubric_items
      .map((entry, index) => {
        const criterion = String(entry.criterion ?? "").trim();
        if (!criterion) {
          return null;
        }
        const weight = Number.parseFloat(String(entry.weight_percent ?? 0));
        const normalizedWeight = Number.isFinite(weight) ? Math.min(Math.max(weight, 0), 100) : 0;
        const resolvedId =
          String(entry.id ?? "").trim() || `rubric-${index + 1}`;
        return {
          id: resolvedId,
          criterion,
          weight_percent: Number(normalizedWeight.toFixed(2)),
        };
      })
      .filter((entry): entry is SubmissionRubricCriterion => Boolean(entry));
  }

  const rubricText = (submission.rubric_text ?? "").trim();
  if (!rubricText) {
    return [];
  }
  const lines = rubricText
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const defaultWeight = Number((100 / lines.length).toFixed(2));
  return lines.map((line, index) => {
    const weightedMatch = line.match(/^(.*?)(?:\s*\(([\d.]+)%\))$/);
    const criterion = weightedMatch?.[1]?.trim() || line;
    const parsedWeight = weightedMatch?.[2] ? Number.parseFloat(weightedMatch[2]) : Number.NaN;
    const weightPercent = Number.isFinite(parsedWeight)
      ? Math.min(Math.max(parsedWeight, 0), 100)
      : defaultWeight;
    return {
      id: `rubric-${index + 1}`,
      criterion,
      weight_percent: Number(weightPercent.toFixed(2)),
    };
  });
}

export default function TeacherSectionsPage() {
  const { id: currentTeacherId } = useAuth();
  const params = useSearchParams();
  const routeParams = useParams<{ moduleId?: string | string[] }>();
  const sectionQuery = params.get("section");
  const routeModuleId = Array.isArray(routeParams?.moduleId)
    ? routeParams.moduleId[0]
    : routeParams?.moduleId;
  const moduleQuery = params.get("module") ?? routeModuleId ?? "";

  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(sectionQuery ?? "");
  const [selectedSection, setSelectedSection] = useState<LmsSection | null>(null);
  const [modules, setModules] = useState<TeacherSectionModule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [deletingModuleId, setDeletingModuleId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [previewItemId, setPreviewItemId] = useState<number | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleDescription, setNewModuleDescription] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>(moduleQuery ?? "");
  const [showCreateModuleModal, setShowCreateModuleModal] = useState(false);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const modulesPanelRef = useRef<HTMLDivElement | null>(null);
  const editorPanelRef = useRef<HTMLDivElement | null>(null);

  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<BuilderItemType>("readable");
  const [itemInstructions, setItemInstructions] = useState("");
  const [itemContent, setItemContent] = useState("");
  const [, setItemQuestion] = useState("");
  const [, setItemAnswer] = useState("");
  const [mcqQuestions, setMcqQuestions] = useState<McqQuestionDraft[]>([
    createMcqQuestionDraft({ id: "q1" }),
  ]);
  const [identificationQuestions, setIdentificationQuestions] = useState<IdentificationQuestionDraft[]>([
    createIdentificationQuestionDraft({ id: "q1" }),
  ]);
  const [readableFiles, setReadableFiles] = useState<ReadableUploadEntry[]>([]);
  const [isReadableDropActive, setIsReadableDropActive] = useState(false);
  const [readablePresentationMode, setReadablePresentationMode] =
    useState<ReadablePresentationMode>("auto");
  const [readableResourceLink, setReadableResourceLink] = useState("");
  const [signingLabMode, setSigningLabMode] = useState<RecognitionMode>("alphabet");
  const [signingLabNumbersRange, setSigningLabNumbersRange] = useState<NumbersCategory>("0-10");
  const [signingLabWordsCategory, setSigningLabWordsCategory] = useState<WordsCategory>("greeting");
  const [signingLabEntries, setSigningLabEntries] = useState<SigningLabEntryDraft[]>([
    createSigningLabEntryDraft({ id: "q1" }),
  ]);
  const [signingLabRequireAll, setSigningLabRequireAll] = useState(true);
  const [signingLabRequiredCount, setSigningLabRequiredCount] = useState(1);
  const [uploadRubrics, setUploadRubrics] = useState<UploadRubricDraft[]>([
    createUploadRubricDraft({ id: "rubric-1", weightPercent: 25 }),
  ]);
  const [uploadMaxPoints, setUploadMaxPoints] = useState(100);
  const [uploadReferenceLink, setUploadReferenceLink] = useState("");
  const [uploadSupportFiles, setUploadSupportFiles] = useState<File[]>([]);
  const [activeSubmissionModuleId, setActiveSubmissionModuleId] = useState<number | null>(null);
  const [activeSubmissionItemId, setActiveSubmissionItemId] = useState<number | null>(null);
  const [submissionAssessments, setSubmissionAssessments] = useState<TeacherUploadAssessmentSummary[]>([]);
  const [moduleSubmissions, setModuleSubmissions] = useState<TeacherModuleSubmission[]>([]);
  const [isLoadingSubmissionAssessments, setIsLoadingSubmissionAssessments] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [gradingProgressId, setGradingProgressId] = useState<number | null>(null);
  const [feedbackDraftByProgressId, setFeedbackDraftByProgressId] = useState<Record<number, string>>({});
  const [activeRubricSubmission, setActiveRubricSubmission] = useState<TeacherModuleSubmission | null>(null);
  const [activeRubricCriteria, setActiveRubricCriteria] = useState<SubmissionRubricCriterion[]>([]);
  const [rubricAchievedByCriterionId, setRubricAchievedByCriterionId] = useState<Record<string, number>>({});

  const selectedModule = useMemo(
    () => modules.find((module) => String(module.id) === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );
  const canManageModule = (module: TeacherSectionModule | null): boolean =>
    Boolean(module && (module.created_by_teacher_id == null || module.created_by_teacher_id === currentTeacherId));
  const canEditSelectedModule = canManageModule(selectedModule);
  const selectedModuleInstructorName =
    selectedModule?.instructor_name?.trim() || "Unknown Instructor";
  const activeSubmissionModule = useMemo(
    () =>
      activeSubmissionModuleId !== null
        ? modules.find((module) => module.id === activeSubmissionModuleId) ?? null
        : null,
    [activeSubmissionModuleId, modules]
  );
  const activeSubmissionBatchName = useMemo(() => {
    if (!activeSubmissionModule) {
      return selectedSection?.name ?? null;
    }
    return (
      sections.find((entry) => entry.section.id === activeSubmissionModule.section_id)?.section.name ??
      selectedSection?.name ??
      null
    );
  }, [activeSubmissionModule, sections, selectedSection]);
  const activeSubmissionAssessment = useMemo(
    () =>
      activeSubmissionItemId !== null
        ? submissionAssessments.find((entry) => entry.item_id === activeSubmissionItemId) ?? null
        : null,
    [activeSubmissionItemId, submissionAssessments]
  );
  const activeSubmissionCanGrade = Boolean(activeSubmissionAssessment?.can_grade);
  const editingItem = useMemo(
    () => selectedModule?.items.find((item) => item.id === editingItemId) ?? null,
    [selectedModule, editingItemId]
  );
  const isEditingItem = editingItemId !== null;
  const previewItem = useMemo(
    () => selectedModule?.items.find((item) => item.id === previewItemId) ?? null,
    [selectedModule, previewItemId]
  );
  const activeRubricTotals = useMemo(() => {
    if (!activeRubricSubmission) {
      return null;
    }
    const criterionRows = activeRubricCriteria.map((criterion) => {
      const achievedRaw = rubricAchievedByCriterionId[criterion.id] ?? 0;
      const achievedPercent = Math.min(Math.max(achievedRaw, 0), 100);
      const contributedPercent = (criterion.weight_percent * achievedPercent) / 100;
      return {
        ...criterion,
        achievedPercent: Number(achievedPercent.toFixed(2)),
        contributedPercent: Number(contributedPercent.toFixed(2)),
      };
    });
    const totalPercent = Number(
      Math.min(
        Math.max(
          criterionRows.reduce((sum, row) => sum + row.contributedPercent, 0),
          0
        ),
        100
      ).toFixed(2)
    );
    const maxPoints = Number.isFinite(activeRubricSubmission.max_points)
      ? activeRubricSubmission.max_points
      : 100;
    const scorePoints = Number(((totalPercent / 100) * maxPoints).toFixed(2));
    return {
      criterionRows,
      totalPercent,
      scorePoints,
      maxPoints,
    };
  }, [activeRubricSubmission, activeRubricCriteria, rubricAchievedByCriterionId]);
  const existingReadableAttachmentCount = useMemo(() => {
    if (!editingItem || editingItem.item_type !== "readable") {
      return 0;
    }
    return getItemAttachments(editingItem).length;
  }, [editingItem]);
  const editingItemAttachments = useMemo(() => {
    if (!editingItem) {
      return [];
    }
    return getItemAttachments(editingItem);
  }, [editingItem]);

  function appendReadableFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    setReadableFiles((current) => {
      const seen = new Set(current.map((entry) => entry.id));
      const merged = [...current];
      for (const file of files) {
        const key = buildReadableUploadId(file);
        if (!seen.has(key)) {
          merged.push({
            id: key,
            file,
            label: defaultReadableLabel(file.name)
          });
          seen.add(key);
        }
      }
      return merged;
    });
  }

  function onReadableFileSelect(event: ChangeEvent<HTMLInputElement>) {
    appendReadableFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onReadableDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsReadableDropActive(false);
    appendReadableFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function onReadableDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsReadableDropActive(true);
  }

  function onReadableDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsReadableDropActive(false);
  }

  function removeReadableFile(index: number) {
    setReadableFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  function updateReadableFileLabel(index: number, label: string) {
    setReadableFiles((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              label
            }
          : entry
      )
    );
  }

  function moveReadableFile(index: number, direction: "up" | "down") {
    setReadableFiles((current) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      const [picked] = next.splice(index, 1);
      next.splice(target, 0, picked);
      return next;
    });
  }

  async function refreshSection(sectionId: string, preferredModuleId?: string | null) {
    if (!sectionId) {
      setSelectedSection(null);
      setModules([]);
      setSelectedModuleId("");
      setEditingItemId(null);
      return;
    }
    const [sectionData, moduleData] = await Promise.all([
      getTeacherSection(Number(sectionId)),
      getTeacherSectionModules(Number(sectionId))
    ]);
    setSelectedSection(sectionData);
    setModules(moduleData);
    const normalizedPreferredModuleId = (preferredModuleId || "").trim();
    if (editingItemId !== null) {
      const stillExists = moduleData.some((module) => module.items.some((item) => item.id === editingItemId));
      if (!stillExists) {
        setEditingItemId(null);
      }
    }
    if (previewItemId !== null) {
      const stillExists = moduleData.some((module) => module.items.some((item) => item.id === previewItemId));
      if (!stillExists) {
        closePreview();
      }
    }
    if (moduleData.length === 0) {
      setSelectedModuleId("");
      return;
    }
    if (
      normalizedPreferredModuleId &&
      moduleData.some((module) => String(module.id) === normalizedPreferredModuleId)
    ) {
      setSelectedModuleId(normalizedPreferredModuleId);
      return;
    }
    if (selectedModuleId && moduleData.some((module) => String(module.id) === selectedModuleId)) {
      return;
    }
    setSelectedModuleId("");
  }

  useEffect(() => {
    getTeacherSections()
      .then((data) => {
        setSections(data);
        const initial = sectionQuery || (data[0] ? String(data[0].section.id) : "");
        setSelectedSectionId(initial);
        if (initial) {
          void refreshSection(initial, moduleQuery);
        }
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, [moduleQuery, sectionQuery]);

  useEffect(() => {
    if (!message) {
      return;
    }
    notifySuccess(message);
    setMessage(null);
  }, [message]);

  useEffect(() => {
    if (!selectedModuleId || !selectedModule) {
      return;
    }
    const timer = window.setTimeout(() => {
      editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedModule, selectedModuleId]);

  function clearItemBuilder() {
    setItemTitle("");
    setItemInstructions("");
    setItemContent("");
    setItemQuestion("");
    setItemAnswer("");
    setMcqQuestions([createMcqQuestionDraft({ id: "q1" })]);
    setIdentificationQuestions([createIdentificationQuestionDraft({ id: "q1" })]);
    setReadableFiles([]);
    setIsReadableDropActive(false);
    setReadablePresentationMode("auto");
    setReadableResourceLink("");
    setSigningLabMode("alphabet");
    setSigningLabNumbersRange("0-10");
    setSigningLabWordsCategory("greeting");
    setSigningLabEntries([createSigningLabEntryDraft({ id: "q1" })]);
    setSigningLabRequireAll(true);
    setSigningLabRequiredCount(1);
    setUploadRubrics([createUploadRubricDraft({ id: "rubric-1", weightPercent: 25 })]);
    setUploadMaxPoints(100);
    setUploadReferenceLink("");
    setUploadSupportFiles([]);
    setEditingItemId(null);
  }

  function beginEditItem(item: LmsModuleItem) {
    if (!canEditSelectedModule) {
      setError("View only. Only the teacher who created this module can edit it.");
      return;
    }
    window.setTimeout(() => {
      editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    setEditingItemId(item.id);
    setItemType(normalizeBuilderItemType(item.item_type));
    setItemTitle(item.title);
    setItemInstructions(item.instructions ?? "");
    setItemContent(item.content_text ?? "");
    setReadableFiles([]);
    setReadablePresentationMode("auto");
    setReadableResourceLink("");
    setUploadReferenceLink("");
    setUploadSupportFiles([]);

    if (item.item_type === "readable") {
      setReadablePresentationMode(parseReadablePresentationMode(item.config.presentation_mode));
      setReadableResourceLink(readConfigLink(item.config, "resource_link"));
      setItemQuestion("");
      setItemAnswer("");
      setMcqQuestions([createMcqQuestionDraft({ id: "q1" })]);
      setIdentificationQuestions([createIdentificationQuestionDraft({ id: "q1" })]);
      setSigningLabEntries([createSigningLabEntryDraft({ id: "q1" })]);
      setSigningLabRequireAll(true);
      setSigningLabRequiredCount(1);
      return;
    }

    if (item.item_type === "multiple_choice_assessment") {
      setMcqQuestions(parseMcqQuestionDrafts(item));
      setItemQuestion("");
      setItemAnswer("");
      setIdentificationQuestions([createIdentificationQuestionDraft({ id: "q1" })]);
      setSigningLabEntries([createSigningLabEntryDraft({ id: "q1" })]);
      setSigningLabRequireAll(true);
      setSigningLabRequiredCount(1);
      return;
    }

    if (item.item_type === "identification_assessment") {
      setIdentificationQuestions(parseIdentificationQuestionDrafts(item));
      setItemQuestion("");
      setItemAnswer("");
      setMcqQuestions([createMcqQuestionDraft({ id: "q1" })]);
      setSigningLabEntries([createSigningLabEntryDraft({ id: "q1" })]);
      setSigningLabRequireAll(true);
      setSigningLabRequiredCount(1);
      return;
    }

    if (item.item_type === "signing_lab_assessment") {
      const parsedEntries = parseSigningLabEntryDrafts(item);
      const parsedRequireAll = parseBooleanFlag(item.config.require_all) ?? true;
      const parsedRequiredCount = parseRequiredCount(item.config.required_count);
      const maxEntries = Math.max(1, parsedEntries.length);
      const resolvedRequiredCount = parsedRequireAll
        ? maxEntries
        : Math.max(1, Math.min(parsedRequiredCount ?? maxEntries, maxEntries));
      setItemQuestion(typeof item.config.question === "string" ? item.config.question : "");
      setItemAnswer(typeof item.config.expected_answer === "string" ? item.config.expected_answer : "");
      setSigningLabMode(parseLabMode(item.config.lab_mode) ?? "alphabet");
      setSigningLabNumbersRange(parseNumbersCategory(item.config.numbers_category) ?? "0-10");
      setSigningLabWordsCategory(parseWordsCategory(item.config.words_category) ?? "greeting");
      setSigningLabEntries(parsedEntries);
      setSigningLabRequireAll(parsedRequireAll);
      setSigningLabRequiredCount(resolvedRequiredCount);
      setMcqQuestions([createMcqQuestionDraft({ id: "q1" })]);
      setIdentificationQuestions([createIdentificationQuestionDraft({ id: "q1" })]);
      return;
    }

    if (item.item_type === "upload_assessment") {
      const rawMaxPoints = item.config.max_points;
      const parsedMaxPoints =
        typeof rawMaxPoints === "number"
          ? rawMaxPoints
          : typeof rawMaxPoints === "string"
            ? Number.parseFloat(rawMaxPoints)
            : Number.NaN;
      setUploadRubrics(parseUploadRubricDrafts(item));
      setUploadMaxPoints(
        Number.isFinite(parsedMaxPoints) && parsedMaxPoints > 0
          ? Math.min(Math.max(parsedMaxPoints, 1), 100)
          : 100
      );
      setUploadReferenceLink(readConfigLink(item.config, "reference_link"));
      setItemQuestion("");
      setItemAnswer("");
      setMcqQuestions([createMcqQuestionDraft({ id: "q1" })]);
      setIdentificationQuestions([createIdentificationQuestionDraft({ id: "q1" })]);
      setSigningLabEntries([createSigningLabEntryDraft({ id: "q1" })]);
      setSigningLabRequireAll(true);
      setSigningLabRequiredCount(1);
      return;
    }

    setItemQuestion("");
    setItemAnswer("");
    setMcqQuestions([createMcqQuestionDraft({ id: "q1" })]);
    setIdentificationQuestions([createIdentificationQuestionDraft({ id: "q1" })]);
    setSigningLabEntries([createSigningLabEntryDraft({ id: "q1" })]);
    setSigningLabRequireAll(true);
    setSigningLabRequiredCount(1);
  }

  function addMcqQuestion(afterIndex?: number) {
    setMcqQuestions((current) => {
      const next = [...current];
      const insertAt =
        typeof afterIndex === "number"
          ? Math.min(Math.max(afterIndex + 1, 0), next.length)
          : next.length;
      next.splice(insertAt, 0, createMcqQuestionDraft());
      return next;
    });
  }

  function removeMcqQuestion(questionIndex: number) {
    setMcqQuestions((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, index) => index !== questionIndex);
    });
  }

  function updateMcqQuestionText(questionIndex: number, value: string) {
    setMcqQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex ? { ...entry, question: value } : entry
      )
    );
  }

  function updateMcqChoice(questionIndex: number, choiceIndex: number, value: string) {
    setMcqQuestions((current) =>
      current.map((entry, index) => {
        if (index !== questionIndex) {
          return entry;
        }
        return {
          ...entry,
          choices: entry.choices.map((choice, indexInChoices) =>
            indexInChoices === choiceIndex ? value : choice
          ),
        };
      })
    );
  }

  function setMcqQuestionCorrect(questionIndex: number, choiceIndex: number) {
    setMcqQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex ? { ...entry, correctIndex: choiceIndex } : entry
      )
    );
  }

  function addMcqChoice(questionIndex: number) {
    setMcqQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex ? { ...entry, choices: [...entry.choices, ""] } : entry
      )
    );
  }

  function removeMcqChoice(questionIndex: number, choiceIndex: number) {
    setMcqQuestions((current) =>
      current.map((entry, index) => {
        if (index !== questionIndex || entry.choices.length <= 2) {
          return entry;
        }
        const nextChoices = entry.choices.filter((_, indexInChoices) => indexInChoices !== choiceIndex);
        const nextCorrectIndex =
          entry.correctIndex === choiceIndex
            ? 0
            : entry.correctIndex > choiceIndex
              ? entry.correctIndex - 1
              : entry.correctIndex;
        return {
          ...entry,
          choices: nextChoices,
          correctIndex: Math.max(0, Math.min(nextCorrectIndex, nextChoices.length - 1)),
        };
      })
    );
  }

  function setMcqQuestionPromptFile(questionIndex: number, file: File | null) {
    setMcqQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex
          ? {
              ...entry,
              promptFile: file,
            }
          : entry
      )
    );
  }

  function addIdentificationQuestion(afterIndex?: number) {
    setIdentificationQuestions((current) => {
      const next = [...current];
      const insertAt =
        typeof afterIndex === "number"
          ? Math.min(Math.max(afterIndex + 1, 0), next.length)
          : next.length;
      next.splice(insertAt, 0, createIdentificationQuestionDraft());
      return next;
    });
  }

  function removeIdentificationQuestion(questionIndex: number) {
    setIdentificationQuestions((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, index) => index !== questionIndex);
    });
  }

  function updateIdentificationQuestionText(questionIndex: number, value: string) {
    setIdentificationQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex
          ? {
              ...entry,
              question: value,
            }
          : entry
      )
    );
  }

  function updateIdentificationCorrectAnswer(questionIndex: number, value: string) {
    setIdentificationQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex
          ? {
              ...entry,
              correctAnswer: value,
            }
          : entry
      )
    );
  }

  function updateIdentificationAcceptedAnswers(questionIndex: number, value: string) {
    setIdentificationQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex
          ? {
              ...entry,
              acceptedAnswersText: value,
            }
          : entry
      )
    );
  }

  function setIdentificationQuestionPromptFile(questionIndex: number, file: File | null) {
    setIdentificationQuestions((current) =>
      current.map((entry, index) =>
        index === questionIndex
          ? {
              ...entry,
              promptFile: file,
            }
          : entry
      )
    );
  }

  function addSigningLabEntry(afterIndex?: number) {
    setSigningLabEntries((current) => {
      const next = [...current];
      const insertAt =
        typeof afterIndex === "number"
          ? Math.min(Math.max(afterIndex + 1, 0), next.length)
          : next.length;
      next.splice(insertAt, 0, createSigningLabEntryDraft());
      return next;
    });
  }

  function removeSigningLabEntry(entryIndex: number) {
    setSigningLabEntries((current) => {
      if (current.length <= 1) {
        return current;
      }
      const next = current.filter((_, index) => index !== entryIndex);
      const maxEntries = Math.max(1, next.length);
      setSigningLabRequiredCount((previous) => Math.max(1, Math.min(previous, maxEntries)));
      return next;
    });
  }

  function updateSigningLabEntryPrompt(entryIndex: number, value: string) {
    setSigningLabEntries((current) =>
      current.map((entry, index) =>
        index === entryIndex
          ? {
              ...entry,
              prompt: value,
            }
          : entry
      )
    );
  }

  function updateSigningLabEntryExpectedAnswer(entryIndex: number, value: string) {
    setSigningLabEntries((current) =>
      current.map((entry, index) =>
        index === entryIndex
          ? {
              ...entry,
              expectedAnswer: value,
            }
          : entry
      )
    );
  }

  function addUploadRubric(afterIndex?: number) {
    setUploadRubrics((current) => {
      const next = [...current];
      const insertAt =
        typeof afterIndex === "number"
          ? Math.min(Math.max(afterIndex + 1, 0), next.length)
          : next.length;
      next.splice(insertAt, 0, createUploadRubricDraft());
      return next;
    });
  }

  function removeUploadRubric(rubricIndex: number) {
    setUploadRubrics((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, index) => index !== rubricIndex);
    });
  }

  function updateUploadRubricCriterion(rubricIndex: number, value: string) {
    setUploadRubrics((current) =>
      current.map((entry, index) =>
        index === rubricIndex
          ? {
              ...entry,
              criterion: value,
            }
          : entry
      )
    );
  }

  function updateUploadRubricWeight(rubricIndex: number, value: number) {
    const normalized = Math.min(Math.max(value, 0), 100);
    setUploadRubrics((current) =>
      current.map((entry, index) =>
        index === rubricIndex
          ? {
              ...entry,
              weightPercent: normalized,
            }
          : entry
      )
    );
  }

  function openPreview(item: LmsModuleItem) {
    setPreviewItemId(item.id);
    setPreviewSlideIndex(0);
  }

  function closePreview() {
    setPreviewItemId(null);
    setPreviewSlideIndex(0);
  }

  function renderPreviewAsset(asset: ModuleAsset) {
    const url = resolveAssetUrl(asset);
    if (asset.resource_kind === "image") {
      return (
        <div
          className="d-flex align-items-center justify-content-center rounded-3 border border-brandBorder bg-brandOffWhite p-2"
          style={{ minHeight: "220px" }}
        >
          <img
            alt={asset.resource_file_name}
            className="mw-100 rounded-3 object-contain"
            src={url}
            style={{ maxHeight: "320px" }}
          />
        </div>
      );
    }
    if (asset.resource_kind === "video") {
      return <video className="w-100 rounded-3 max-h-80" controls preload="metadata" src={url} />;
    }
    return (
      <a className="btn btn-outline-primary btn-sm" href={url} rel="noreferrer" target="_blank">
        Open {asset.resource_file_name}
      </a>
    );
  }

  function renderItemPreviewBody(item: LmsModuleItem) {
    if (item.item_type === "readable") {
      const attachments = getItemAttachments(item);
      const mode = parseReadablePresentationMode(item.config.presentation_mode);
      const resourceLink = readConfigLink(item.config, "resource_link");
      const cardVideos = attachments.filter((asset) => asset.resource_kind === "video");
      const cardNonVideos = attachments.filter((asset) => asset.resource_kind !== "video");
      const currentSlide =
        attachments.length > 0
          ? Math.min(Math.max(previewSlideIndex, 0), attachments.length - 1)
          : 0;
      const slideAsset = attachments[currentSlide];
      return (
        <div className="vstack gap-3">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {item.content_text || "No readable content yet."}
          </p>
          {resourceLink ? (
            <div className="rounded-3 border border-brandBorder bg-white px-3 py-3">
              <p className="small fw-semibold mb-1">Learning Material Link</p>
              <a
                className="small fw-semibold text-primary text-break"
                href={resourceLink}
                rel="noreferrer"
                target="_blank"
              >
                {resourceLink}
              </a>
            </div>
          ) : null}
          {attachments.length > 0 && mode !== "slideshow" ? (
            <div className="vstack gap-3">
              {cardVideos.map((asset) => (
                <div className="card border-brandBorder" key={`${asset.resource_file_name}-${asset.resource_file_path}`}>
                  <div className="card-body">
                    {renderPreviewAsset(asset)}
                    <p className="small fw-semibold mt-2 mb-0 text-center">{asset.resource_file_name}</p>
                  </div>
                </div>
              ))}
              <div className="row g-3">
                {cardNonVideos.map((asset) => (
                <div className="col-12 col-md-4" key={`${asset.resource_file_name}-${asset.resource_file_path}`}>
                  <div className="card border-brandBorder h-100">
                    <div className="card-body">
                      {renderPreviewAsset(asset)}
                      <p className="small fw-semibold mt-2 mb-0 text-center">
                        {asset.resource_kind === "image"
                          ? resolveAssetLabel(asset)
                          : asset.resource_file_name}
                      </p>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            </div>
          ) : null}
          {attachments.length > 0 && mode === "slideshow" ? (
            <div className="card border-brandBorder">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="small fw-semibold">
                    Slide {currentSlide + 1} of {attachments.length}
                  </span>
                  <div className="btn-group btn-group-sm">
                    <button
                      className="btn btn-outline-secondary"
                      disabled={currentSlide <= 0}
                      onClick={() => setPreviewSlideIndex((current) => Math.max(current - 1, 0))}
                      type="button"
                    >
                      Previous
                    </button>
                    <button
                      className="btn btn-outline-secondary"
                      disabled={currentSlide >= attachments.length - 1}
                      onClick={() =>
                        setPreviewSlideIndex((current) =>
                          Math.min(current + 1, attachments.length - 1)
                        )
                      }
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
                {slideAsset ? renderPreviewAsset(slideAsset) : null}
                {slideAsset ? (
                  <p className="small fw-semibold mt-2 mb-0 text-center">
                    {resolveAssetLabel(slideAsset)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {attachments.length === 0 ? (
            <p className="mb-0 small text-slate-600">No attachments yet.</p>
          ) : null}
        </div>
      );
    }

    if (item.item_type === "multiple_choice_assessment") {
      const attachments = getItemAttachments(item);
      const sharedPromptMedia = getPromptMedia(item);
      const questionSet = Array.isArray(item.config.questions)
        ? (item.config.questions as unknown[])
            .map((entry, index) => {
              if (!entry || typeof entry !== "object") {
                return null;
              }
              const row = entry as Record<string, unknown>;
              const question = typeof row.question === "string" ? row.question : "";
              const choices = Array.isArray(row.choices)
                ? (row.choices as unknown[]).map((choice) => String(choice))
                : [];
              return {
                key:
                  typeof row.question_key === "string" && row.question_key.trim()
                    ? row.question_key.trim()
                    : `q${index + 1}`,
                question,
                choices,
              };
            })
            .filter((entry): entry is { key: string; question: string; choices: string[] } => Boolean(entry))
        : [];
      const fallbackQuestion =
        typeof item.config.question === "string" ? item.config.question : "";
      const fallbackChoices = Array.isArray(item.config.choices)
        ? (item.config.choices as unknown[]).map((entry) => String(entry))
        : [];
      const displayQuestions =
        questionSet.length > 0
          ? questionSet
          : [{ key: "q1", question: fallbackQuestion, choices: fallbackChoices }];
      const hasPerQuestionPrompt = displayQuestions.some((entry) =>
        Boolean(getMcqQuestionPromptAsset(attachments, entry.key))
      );
      return (
        <div className="vstack gap-2">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {item.instructions || "Students answer each question in this topic before submitting."}
          </p>
          {sharedPromptMedia && !hasPerQuestionPrompt ? (
            <div className="card border-brandBorder">
              <div className="card-body">
                <p className="small fw-semibold mb-2">{sharedPromptMedia.resource_file_name}</p>
                {renderPreviewAsset(sharedPromptMedia)}
              </div>
            </div>
          ) : null}
          {displayQuestions.map((entry, questionIndex) => {
            const questionPrompt = getMcqQuestionPromptAsset(attachments, entry.key);
            return (
              <div className="rounded-3 border border-brandBorder bg-white px-3 py-3" key={entry.key}>
                <p className="mb-2 fw-semibold text-sm">
                  {questionIndex + 1}. {entry.question || "No question yet."}
                </p>
                {questionPrompt ? (
                  <div className="mb-3">
                    <p className="small fw-semibold mb-2">{questionPrompt.resource_file_name}</p>
                    {renderPreviewAsset(questionPrompt)}
                  </div>
                ) : null}
                {entry.choices.map((choice, index) => (
                  <div className="form-check" key={`${entry.key}-${choice}-${index}`}>
                    <input className="form-check-input" disabled type="radio" />
                    <label className="form-check-label text-sm">{choice}</label>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      );
    }

    if (item.item_type === "identification_assessment") {
      const attachments = getItemAttachments(item);
      const sharedPromptMedia = getPromptMedia(item);
      const questionSet = Array.isArray(item.config.questions)
        ? (item.config.questions as unknown[])
            .map((entry, index) => {
              if (!entry || typeof entry !== "object") {
                return null;
              }
              const row = entry as Record<string, unknown>;
              const acceptedAnswers = Array.isArray(row.accepted_answers)
                ? (row.accepted_answers as unknown[]).map((value) => String(value))
                : [];
              return {
                key:
                  typeof row.question_key === "string" && row.question_key.trim()
                    ? row.question_key.trim()
                    : `q${index + 1}`,
                question: typeof row.question === "string" ? row.question : "",
                answer: typeof row.correct_answer === "string" ? row.correct_answer : "",
                acceptedAnswers,
              };
            })
            .filter(
              (
                entry
              ): entry is { key: string; question: string; answer: string; acceptedAnswers: string[] } =>
                Boolean(entry)
            )
        : [];
      const fallbackQuestion = typeof item.config.question === "string" ? item.config.question : "";
      const fallbackAnswer = typeof item.config.correct_answer === "string" ? item.config.correct_answer : "";
      const fallbackAccepted = Array.isArray(item.config.accepted_answers)
        ? (item.config.accepted_answers as unknown[]).map((value) => String(value))
        : [];
      const displayQuestions =
        questionSet.length > 0
          ? questionSet
          : [{ key: "q1", question: fallbackQuestion, answer: fallbackAnswer, acceptedAnswers: fallbackAccepted }];
      const hasPerQuestionPrompt = displayQuestions.some((entry) =>
        Boolean(getIdentificationQuestionPromptAsset(attachments, entry.key))
      );
      return (
        <div className="vstack gap-3">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {item.instructions || "Students will type their answer for each question."}
          </p>
          {sharedPromptMedia && !hasPerQuestionPrompt ? (
            <div className="card border-brandBorder">
              <div className="card-body">
                <p className="small fw-semibold mb-2">{sharedPromptMedia.resource_file_name}</p>
                {renderPreviewAsset(sharedPromptMedia)}
              </div>
            </div>
          ) : null}
          {displayQuestions.map((entry, questionIndex) => {
            const questionPrompt = getIdentificationQuestionPromptAsset(attachments, entry.key);
            return (
              <div className="rounded-3 border border-brandBorder bg-white px-3 py-3" key={entry.key}>
                <p className="mb-2 fw-semibold text-sm">
                  {questionIndex + 1}. {entry.question || "No question yet."}
                </p>
                {questionPrompt ? (
                  <div className="mb-3">
                    <p className="small fw-semibold mb-2">{questionPrompt.resource_file_name}</p>
                    {renderPreviewAsset(questionPrompt)}
                  </div>
                ) : null}
                <p className="mb-1 small text-slate-700">
                  Correct answer: <span className="fw-semibold">{entry.answer || "Not set"}</span>
                </p>
                <p className="mb-0 small text-slate-600">
                  Accepted answers:{" "}
                  <span className="fw-semibold">
                    {entry.acceptedAnswers.length > 0 ? entry.acceptedAnswers.join(", ") : "None"}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      );
    }

    if (item.item_type === "signing_lab_assessment") {
      const config = getSigningLabConfig(item);
      return (
        <div className="vstack gap-2">
          {config ? (
            <div className="small text-slate-700">
              <p className="mb-1">Camera Type: <span className="fw-semibold">{displayType(config.mode)}</span></p>
              {config.mode === "numbers" ? (
                <p className="mb-1">Range: <span className="fw-semibold">{displayNumbersRangeLabel(config.numbersCategory)}</span></p>
              ) : null}
              {config.mode === "words" ? (
                <p className="mb-1">Category: <span className="fw-semibold">{displayWordsCategoryLabel(config.wordsCategory)}</span></p>
              ) : null}
              <p className="mb-1">
                Required to submit:{" "}
                <span className="fw-semibold">
                  {config.requireAll ? `All ${config.entries.length} entries` : `${config.requiredCount} of ${config.entries.length} entries`}
                </span>
              </p>
              {config.entries.length > 0 ? (
                <div className="rounded-3 border border-brandBorder bg-white px-3 py-3">
                  <p className="mb-2 fw-semibold text-sm">Entry 1 Preview</p>
                  <p className="mb-1 text-sm text-slate-700">
                    Instruction:{" "}
                    <span className="fw-semibold">{config.entries[0].question || "No instruction yet."}</span>
                  </p>
                  <p className="mb-0 text-sm text-slate-700">
                    Expected answer:{" "}
                    <span className="fw-semibold">{config.entries[0].correct_answer || "Not set"}</span>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    if (item.item_type === "upload_assessment") {
      const referenceLink = readConfigLink(item.config, "reference_link");
      return (
        <div className="vstack gap-2">
          <p className="mb-0 rounded-3 bg-brandOffWhite px-3 py-3 text-sm text-slate-700">
            {item.instructions || "Students upload output files, then teacher scores using rubric."}
          </p>
          {referenceLink ? (
            <div className="rounded-3 border border-brandBorder bg-white px-3 py-3">
              <p className="small fw-semibold mb-1">Reference Link</p>
              <a
                className="small fw-semibold text-primary text-break"
                href={referenceLink}
                rel="noreferrer"
                target="_blank"
              >
                {referenceLink}
              </a>
            </div>
          ) : (
            <p className="mb-0 small text-slate-600">No reference link yet.</p>
          )}
        </div>
      );
    }

    return <p className="mb-0 small text-slate-600">No preview available.</p>;
  }

  async function onCreateModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSectionId) {
      return;
    }
    setError(null);
    setMessage(null);
    setIsCreatingModule(true);
    try {
      await createTeacherSectionModule(Number(selectedSectionId), {
        title: newModuleTitle,
        description: newModuleDescription
      });
      setNewModuleTitle("");
      setNewModuleDescription("");
      setShowCreateModuleModal(false);
      setMessage("Module added.");
      await refreshSection(selectedSectionId, null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create module.");
    } finally {
      setIsCreatingModule(false);
    }
  }

  async function onSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModuleId) {
      setError("Choose a module first.");
      return;
    }
    if (!selectedModule || !canManageModule(selectedModule)) {
      setError("View only. Only the teacher who created this module can edit it.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsSavingItem(true);

    try {
      let config: Record<string, unknown> = {};
      let mcqQuestionsForUpload: Array<{ question_key: string; promptFile: File | null }> = [];
      let identificationQuestionsForUpload: Array<{ question_key: string; promptFile: File | null }> = [];
      const existingAssessmentAttachments =
        isEditingItem &&
        editingItem &&
        (itemType === "multiple_choice_assessment" || itemType === "identification_assessment")
          ? getItemAttachments(editingItem).map((asset) => ({
              resource_kind: asset.resource_kind,
              resource_file_name: asset.resource_file_name,
              resource_file_path: asset.resource_file_path,
              resource_mime_type: asset.resource_mime_type ?? null,
              resource_url: asset.resource_url ?? null,
              label: asset.label ?? null,
            }))
          : [];

      if (itemType === "multiple_choice_assessment") {
        if (mcqQuestions.length === 0) {
          setError("Add at least one question.");
          return;
        }
        const normalizedQuestions = mcqQuestions.map((entry, index) => {
          const questionKey = normalizeQuestionKey(entry.id, index);
          const question = entry.question.trim();
          const choices = entry.choices.map((choice) => choice.trim()).filter(Boolean);
          const selectedAnswer = choices[entry.correctIndex] || "";
          if (!question) {
            throw new Error(`Question ${index + 1} is required.`);
          }
          if (choices.length < 2) {
            throw new Error(`Question ${index + 1} needs at least two choices.`);
          }
          if (!selectedAnswer) {
            throw new Error(`Question ${index + 1} needs one correct answer.`);
          }
          return {
            question_key: questionKey,
            question,
            choices,
            correct_answer: selectedAnswer,
            promptFile: entry.promptFile,
          };
        });
        mcqQuestionsForUpload = normalizedQuestions.map((entry) => ({
          question_key: entry.question_key,
          promptFile: entry.promptFile,
        }));
        const firstQuestion = normalizedQuestions[0];
        config = {
          question: firstQuestion.question,
          choices: firstQuestion.choices,
          correct_answer: firstQuestion.correct_answer,
          questions: normalizedQuestions.map(({ promptFile: _promptFile, ...questionConfig }) => questionConfig),
          attachments: existingAssessmentAttachments,
          prompt_media:
            isEditingItem && editingItem
              ? (editingItem.config.prompt_media as unknown) ?? null
              : null,
        };
      } else if (itemType === "identification_assessment") {
        if (identificationQuestions.length === 0) {
          setError("Add at least one identification question.");
          return;
        }
        const normalizedQuestions = identificationQuestions.map((entry, index) => {
          const questionKey = normalizeQuestionKey(entry.id, index);
          const question = entry.question.trim();
          const correctAnswer = entry.correctAnswer.trim();
          if (!question) {
            throw new Error(`Identification question ${index + 1} is required.`);
          }
          if (!correctAnswer) {
            throw new Error(`Identification question ${index + 1} needs a correct answer.`);
          }
          const acceptedAnswers = Array.from(
            new Set(
              [correctAnswer, ...normalizeWords(entry.acceptedAnswersText)].map((value) => value.trim()).filter(Boolean)
            )
          );
          return {
            question_key: questionKey,
            question,
            correct_answer: correctAnswer,
            accepted_answers: acceptedAnswers,
            promptFile: entry.promptFile,
          };
        });
        identificationQuestionsForUpload = normalizedQuestions.map((entry) => ({
          question_key: entry.question_key,
          promptFile: entry.promptFile,
        }));
        const firstQuestion = normalizedQuestions[0];
        config = {
          question: firstQuestion.question,
          correct_answer: firstQuestion.correct_answer,
          accepted_answers: firstQuestion.accepted_answers,
          questions: normalizedQuestions.map(({ promptFile: _promptFile, ...questionConfig }) => questionConfig),
          attachments: existingAssessmentAttachments,
          prompt_media:
            isEditingItem && editingItem
              ? (editingItem.config.prompt_media as unknown) ?? null
              : null,
        };
      } else if (itemType === "signing_lab_assessment") {
        if (signingLabEntries.length === 0) {
          setError("Add at least one camera interface entry.");
          return;
        }
        if (signingLabMode === "numbers" && !signingLabNumbersRange) {
          setError("Choose a numbers range for camera interface assessment.");
          return;
        }
        if (signingLabMode === "words" && !signingLabWordsCategory) {
          setError("Choose a words category for camera interface assessment.");
          return;
        }
        const normalizedEntries = signingLabEntries.map((entry, index) => {
          const questionKey = normalizeQuestionKey(entry.id, index);
          const prompt = entry.prompt.trim();
          const expectedAnswer = entry.expectedAnswer.trim();
          if (!prompt) {
            throw new Error(`Camera interface entry ${index + 1} needs an instruction.`);
          }
          if (!expectedAnswer) {
            throw new Error(`Camera interface entry ${index + 1} needs an expected answer.`);
          }
          return {
            question_key: questionKey,
            question: prompt,
            correct_answer: expectedAnswer,
          };
        });
        const maxEntries = normalizedEntries.length;
        const resolvedRequiredCount = signingLabRequireAll
          ? maxEntries
          : Math.max(1, Math.min(Math.trunc(signingLabRequiredCount || maxEntries), maxEntries));
        const firstEntry = normalizedEntries[0];
        config = {
          question: firstEntry.question,
          expected_answer: firstEntry.correct_answer,
          helper_text: "Open the camera interface, analyze your sign, and submit the detected result.",
          lab_mode: signingLabMode,
          numbers_category: signingLabMode === "numbers" ? signingLabNumbersRange : null,
          words_category: signingLabMode === "words" ? signingLabWordsCategory : null,
          questions: normalizedEntries,
          require_all: signingLabRequireAll,
          required_count: resolvedRequiredCount,
        };
      } else if (itemType === "upload_assessment") {
        const normalizedRubrics = uploadRubrics
          .map((entry) => ({
            criterion: entry.criterion.trim(),
            weight_percent: Number(Math.min(Math.max(entry.weightPercent, 0), 100).toFixed(2)),
          }))
          .filter((entry) => entry.criterion);
        if (normalizedRubrics.length === 0) {
          setError("Add at least one rubric criterion.");
          return;
        }
        const totalWeight = normalizedRubrics.reduce(
          (total, entry) => total + entry.weight_percent,
          0
        );
        if (totalWeight > 100) {
          setError("Rubric total weight cannot exceed 100%.");
          return;
        }
        const resolvedMaxPoints = Math.min(Math.max(uploadMaxPoints || 100, 1), 100);
        const existingAttachments =
          isEditingItem && editingItem
            ? (editingItem.config.attachments as unknown[] | undefined) ?? []
            : [];
        config = {
          rubric_items: normalizedRubrics,
          rubric_text: normalizedRubrics
            .map((entry) => `${entry.criterion} (${entry.weight_percent}%)`)
            .join("\n"),
          rubric_total_weight_percent: Number(totalWeight.toFixed(2)),
          max_points: Number(resolvedMaxPoints.toFixed(2)),
          reference_link: normalizeExternalLink(uploadReferenceLink),
          allowed_file_types: [
            "video/*",
            "image/*",
            ".pdf",
            ".ppt",
            ".pptx",
            ".doc",
            ".docx",
            ".txt",
          ],
          attachments: existingAttachments,
        };
      } else {
        const existingAttachmentCount =
          editingItem && itemType === "readable" ? getItemAttachments(editingItem).length : 0;
        if (!itemContent.trim() && readableFiles.length === 0 && existingAttachmentCount === 0) {
          setError("Add learning material text or upload at least one file.");
          return;
        }
        config = {
          presentation_mode:
            readablePresentationMode === "auto" ? null : readablePresentationMode,
          resource_link: normalizeExternalLink(readableResourceLink),
          attachments:
            editingItem && itemType === "readable"
              ? (editingItem.config.attachments as unknown[] | undefined) ?? []
              : []
        };
      }

      let updatedModule: TeacherSectionModule;
      let targetItemId: number;
      if (isEditingItem && editingItemId !== null) {
        updatedModule = await updateTeacherModuleItem(editingItemId, {
          title: itemTitle.trim(),
          instructions: itemInstructions.trim() || "",
          content_text: itemType === "readable" ? itemContent.trim() : null,
          config
        });
        targetItemId = editingItemId;
      } else {
        updatedModule = await createTeacherModuleItem(Number(selectedModuleId), {
          title: itemTitle.trim(),
          item_type: itemType,
          content_text: itemType === "readable" ? itemContent.trim() : undefined,
          instructions: itemInstructions.trim() || undefined,
          config
        });
        const createdItem = [...updatedModule.items].sort((a, b) => b.order_index - a.order_index)[0];
        if (!createdItem) {
          throw new Error("Unable to locate the newly created item.");
        }
        targetItemId = createdItem.id;
      }

      if (itemType === "readable" && readableFiles.length > 0) {
        for (const entry of readableFiles) {
          updatedModule = await uploadTeacherModuleItemAsset(targetItemId, {
            file: entry.file,
            usage: "attachment",
            label: entry.label.trim() || undefined
          });
        }
      }
      if (itemType === "identification_assessment") {
        for (const question of identificationQuestionsForUpload) {
          if (!question.promptFile) {
            continue;
          }
          updatedModule = await uploadTeacherModuleItemAsset(targetItemId, {
            file: question.promptFile,
            usage: "attachment",
            label: identificationQuestionAssetLabel(question.question_key),
          });
        }
      }
      if (itemType === "multiple_choice_assessment") {
        for (const question of mcqQuestionsForUpload) {
          if (!question.promptFile) {
            continue;
          }
          updatedModule = await uploadTeacherModuleItemAsset(targetItemId, {
            file: question.promptFile,
            usage: "attachment",
            label: mcqQuestionAssetLabel(question.question_key),
          });
        }
      }
      if (itemType === "upload_assessment" && uploadSupportFiles.length > 0) {
        for (const file of uploadSupportFiles) {
          updatedModule = await uploadTeacherModuleItemAsset(targetItemId, {
            file,
            usage: "attachment",
            label: defaultReadableLabel(file.name),
          });
        }
      }

      if (selectedSectionId) {
        await refreshSection(selectedSectionId, String(updatedModule.id));
      } else {
        setModules((current) =>
          current.map((module) => (module.id === updatedModule.id ? updatedModule : module))
        );
      }
      clearItemBuilder();
      setMessage(isEditingItem ? "Module topic updated." : "Module topic created.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save module topic.");
    } finally {
      setIsSavingItem(false);
    }
  }

  async function onDeleteItem(item: LmsModuleItem) {
    if (!selectedModule || !canManageModule(selectedModule)) {
      setError("View only. Only the teacher who created this module can edit it.");
      return;
    }
    const confirmed = window.confirm(`Delete "${item.title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setMessage(null);
    setDeletingItemId(item.id);
    try {
      const updatedModule = await deleteTeacherModuleItem(item.id);
      setModules((current) =>
        current.map((module) => (module.id === updatedModule.id ? updatedModule : module))
      );
      if (editingItemId === item.id) {
        clearItemBuilder();
      }
      setMessage("Module topic deleted.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete module topic.");
    } finally {
      setDeletingItemId(null);
    }
  }

  async function onDeleteModule(module: TeacherSectionModule) {
    if (!canManageModule(module)) {
      setError("View only. Only the teacher who created this module can delete it.");
      return;
    }
    const confirmed = window.confirm(
      `Delete "${module.title}" and all of its topics/submissions? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    setError(null);
    setMessage(null);
    setDeletingModuleId(module.id);
    try {
      await deleteTeacherModule(module.id);
      const nextSelectedModuleId = selectedModuleId === String(module.id) ? null : selectedModuleId || null;
      if (selectedModuleId === String(module.id)) {
        setSelectedModuleId("");
        clearItemBuilder();
        closePreview();
      }
      if (activeSubmissionModuleId === module.id) {
        closeSubmissionsView();
      }
      if (selectedSectionId) {
        await refreshSection(selectedSectionId, nextSelectedModuleId);
      } else {
        setModules((current) => current.filter((entry) => entry.id !== module.id));
      }
      if (selectedModuleId === String(module.id)) {
        window.setTimeout(() => {
          modulesPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 40);
      }
      setMessage("Module deleted.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete module.");
    } finally {
      setDeletingModuleId(null);
    }
  }

  async function onPublishToggle(module: TeacherSectionModule) {
    if (!canManageModule(module)) {
      setError("View only. Only the teacher who created this module can edit it.");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const updated = await updateTeacherModule(module.id, { is_published: !module.is_published });
      setModules((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setMessage(updated.is_published ? "Module published." : "Module moved to draft.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update module.");
    }
  }

  function openEditItemsView(moduleId: number) {
    if (selectedModuleId === String(moduleId)) {
      editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSelectedModuleId(String(moduleId));
    clearItemBuilder();
  }

  function closeEditItemsView() {
    setSelectedModuleId("");
    clearItemBuilder();
    closePreview();
    window.setTimeout(() => {
      modulesPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  async function openSubmissionsView(module: TeacherSectionModule) {
    setActiveSubmissionModuleId(module.id);
    setActiveSubmissionItemId(null);
    setSubmissionAssessments([]);
    setModuleSubmissions([]);
    setIsLoadingSubmissionAssessments(true);
    setIsLoadingSubmissions(false);
    setError(null);
    setFeedbackDraftByProgressId({});
    setActiveRubricSubmission(null);
    setActiveRubricCriteria([]);
    setRubricAchievedByCriterionId({});
    try {
      const rows = await getTeacherModuleUploadAssessments(module.id);
      setSubmissionAssessments(rows);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load upload assessments."
      );
    } finally {
      setIsLoadingSubmissionAssessments(false);
    }
  }

  async function openAssessmentSubmissions(assessment: TeacherUploadAssessmentSummary) {
    setActiveSubmissionItemId(assessment.item_id);
    setModuleSubmissions([]);
    setIsLoadingSubmissions(true);
    setError(null);
    setActiveRubricSubmission(null);
    setActiveRubricCriteria([]);
    setRubricAchievedByCriterionId({});
    try {
      const rows = await getTeacherUploadAssessmentSubmissions(
        assessment.module_id,
        assessment.item_id
      );
      setModuleSubmissions(rows);
      const nextFeedbackDrafts: Record<number, string> = {};
      rows.forEach((row) => {
        if (row.progress_id) {
          nextFeedbackDrafts[row.progress_id] = row.feedback ?? "";
        }
      });
      setFeedbackDraftByProgressId(nextFeedbackDrafts);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load submissions.");
    } finally {
      setIsLoadingSubmissions(false);
    }
  }

  function backToAssessmentList() {
    setActiveSubmissionItemId(null);
    setModuleSubmissions([]);
    setIsLoadingSubmissions(false);
    setGradingProgressId(null);
    setFeedbackDraftByProgressId({});
    setActiveRubricSubmission(null);
    setActiveRubricCriteria([]);
    setRubricAchievedByCriterionId({});
  }

  function closeSubmissionsView() {
    setActiveSubmissionModuleId(null);
    setActiveSubmissionItemId(null);
    setSubmissionAssessments([]);
    setModuleSubmissions([]);
    setIsLoadingSubmissionAssessments(false);
    setIsLoadingSubmissions(false);
    setGradingProgressId(null);
    setFeedbackDraftByProgressId({});
    setActiveRubricSubmission(null);
    setActiveRubricCriteria([]);
    setRubricAchievedByCriterionId({});
  }

  function openRubricScorer(entry: TeacherModuleSubmission) {
    if (!entry.progress_id) {
      return;
    }
    if (!entry.can_grade) {
      setError("View only. Only the module creator can return scores.");
      return;
    }
    const rubricCriteria = normalizeSubmissionRubricCriteria(entry);
    if (rubricCriteria.length === 0) {
      setError("No rubric criteria found for this upload assessment.");
      return;
    }
    const existingScores = new Map<string, number>();
    if (Array.isArray(entry.rubric_scores)) {
      entry.rubric_scores.forEach((row) => {
        const key = String(row.rubric_id ?? "").trim();
        if (!key) {
          return;
        }
        const value = Number.parseFloat(String(row.achieved_percent ?? 0));
        existingScores.set(key, Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0);
      });
    }
    const nextAchievedById: Record<string, number> = {};
    rubricCriteria.forEach((criterion) => {
      nextAchievedById[criterion.id] = existingScores.get(criterion.id) ?? 0;
    });
    setRubricAchievedByCriterionId(nextAchievedById);
    setActiveRubricCriteria(rubricCriteria);
    setActiveRubricSubmission(entry);
    setError(null);
  }

  function closeRubricScorer() {
    setActiveRubricSubmission(null);
    setActiveRubricCriteria([]);
    setRubricAchievedByCriterionId({});
  }

  async function onSaveRubricScore() {
    if (!activeRubricSubmission?.progress_id || !activeRubricTotals) {
      return;
    }
    if (!activeRubricSubmission.can_grade || !activeSubmissionCanGrade) {
      setError("View only. Only the module creator can return scores.");
      return;
    }
    const progressId = activeRubricSubmission.progress_id;
    setError(null);
    setGradingProgressId(progressId);
    try {
      const updated = await gradeTeacherModuleSubmission(progressId, {
        score_points: activeRubricTotals.scorePoints,
        feedback: feedbackDraftByProgressId[progressId] ?? "",
        rubric_scores: activeRubricTotals.criterionRows.map((row) => ({
          rubric_id: row.id,
          achieved_percent: row.achievedPercent,
        })),
      });
      setModuleSubmissions((current) =>
        current.map((row) => (row.progress_id === updated.progress_id ? updated : row))
      );
      setMessage(`Rubric score returned to ${activeRubricSubmission.student_name}.`);
      closeRubricScorer();
      if (updated.progress_id) {
        setFeedbackDraftByProgressId((current) => ({
          ...current,
          [updated.progress_id as number]: updated.feedback ?? "",
        }));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to return rubric score.");
    } finally {
      setGradingProgressId(null);
    }
  }

  async function onSaveSubmissionRow(row: TeacherModuleSubmission) {
    if (!row.progress_id) {
      return;
    }
    if (!row.can_grade || !activeSubmissionCanGrade) {
      setError("View only. Only the module creator can return scores.");
      return;
    }
    const progressId = row.progress_id;
    const hasRubric = normalizeSubmissionRubricCriteria(row).length > 0;
    const feedbackValue = feedbackDraftByProgressId[progressId] ?? "";
    const payload: {
      score_points?: number;
      feedback?: string | null;
      rubric_scores?: Array<{ rubric_id: string; achieved_percent: number }>;
    } = {
      feedback: feedbackValue,
    };

    if (hasRubric) {
      const existingRubricScores = Array.isArray(row.rubric_scores) ? row.rubric_scores : [];
      if (existingRubricScores.length === 0) {
        setError("Open Rubric Scorer first, then click Return to Student.");
        return;
      }
      payload.rubric_scores = existingRubricScores.map((entry) => ({
        rubric_id: String(entry.rubric_id ?? "").trim(),
        achieved_percent: Math.min(Math.max(Number(entry.achieved_percent ?? 0), 0), 100),
      }));
    } else {
      const resolvedScorePoints =
        typeof row.score_points === "number" && Number.isFinite(row.score_points)
          ? row.score_points
          : typeof row.score_percent === "number" && Number.isFinite(row.score_percent)
            ? Number(((row.score_percent / 100) * row.max_points).toFixed(2))
            : null;
      if (resolvedScorePoints === null) {
        setError("Set score first before returning to student.");
        return;
      }
      payload.score_points = resolvedScorePoints;
    }

    setError(null);
    setGradingProgressId(progressId);
    try {
      const updated = await gradeTeacherModuleSubmission(progressId, payload);
      setModuleSubmissions((current) =>
        current.map((entry) => (entry.progress_id === updated.progress_id ? updated : entry))
      );
      if (updated.progress_id) {
        setFeedbackDraftByProgressId((current) => ({
          ...current,
          [updated.progress_id as number]: updated.feedback ?? "",
        }));
      }
      setMessage(`Returned to ${row.student_name}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to return submission.");
    } finally {
      setGradingProgressId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel">
        <p className="text-xs fw-semibold text-uppercase tracking-[0.2em] text-brandBlue">Teacher Modules</p>
        <h2 className="mt-2 text-3xl fw-bold title-gradient">Module Builder</h2>
        <p className="mt-2 text-sm text-slate-700">
          Build modules, edit module topics, and publish lessons.
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger mb-0" role="alert">
          {error}
        </div>
      ) : null}

      <div className="panel">
        <label className="form-label fw-semibold">Choose Batch</label>
        <select
          className="form-select"
          onChange={(event) => {
            setSelectedSectionId(event.target.value);
            setSelectedModuleId("");
            clearItemBuilder();
            void refreshSection(event.target.value, null);
          }}
          value={selectedSectionId}
        >
          <option value="">Choose a batch</option>
          {sections.map((entry) => (
            <option key={entry.section.id} value={entry.section.id}>
              {entry.section.name}
            </option>
          ))}
        </select>
      </div>

      {selectedSection ? (
        <>
          <div className="panel h-100" ref={modulesPanelRef}>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h3 className="h5 fw-bold mb-0">Modules</h3>
              <button
                className="btn btn-success btn-sm text-white fw-semibold"
                onClick={() => setShowCreateModuleModal(true)}
                type="button"
              >
                Add Module
              </button>
            </div>
            <div className="vstack gap-3">
              {modules.map((module) => (
                <article className="card border-brandBorder shadow-sm" key={module.id}>
                  <div className="card-body">
                    <div className="d-flex flex-wrap justify-content-between gap-3">
                      <div>
                        <p className="mb-1 text-uppercase text-xs tracking-[0.16em] text-slate-500">
                          Module {module.order_index}
                        </p>
                        <h4 className="h6 fw-bold mb-1">{module.title}</h4>
                        <p className="mb-0 text-sm text-slate-700">{module.description}</p>
                        <p className="mt-2 mb-0 text-xs text-slate-600">
                          Instructor:{" "}
                          <span className="fw-semibold">
                            {module.instructor_name?.trim() || "Unknown Instructor"}
                          </span>
                        </p>
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-outline-primary fw-semibold"
                          onClick={() => void openSubmissionsView(module)}
                          type="button"
                        >
                          Check Submissions
                        </button>
                        <button
                          className={`btn btn-sm fw-semibold ${module.is_published ? "btn-danger text-white" : "btn-success text-white"}`}
                          disabled={!canManageModule(module)}
                          onClick={() => void onPublishToggle(module)}
                          type="button"
                        >
                          {module.is_published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          className={`btn btn-sm fw-semibold ${
                            canManageModule(module) ? "btn-info text-white" : "btn-outline-secondary"
                          }`}
                          onClick={() => openEditItemsView(module.id)}
                          type="button"
                        >
                          {canManageModule(module) ? "Edit Topics" : "View Topics"}
                        </button>
                        {canManageModule(module) ? (
                          <button
                            className="btn btn-sm btn-outline-danger fw-semibold"
                            disabled={deletingModuleId === module.id}
                            onClick={() => void onDeleteModule(module)}
                            type="button"
                          >
                            {deletingModuleId === module.id ? "Deleting..." : "Delete Module"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {modules.length === 0 ? (
                <p className="mb-0 text-sm text-slate-600">No modules yet. Add your first module.</p>
              ) : null}
            </div>
          </div>

          {selectedModule ? (
            <div className="row g-4" ref={editorPanelRef}>
              <div className="col-12">
                <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <button
                    className="btn btn-warning btn-sm fw-semibold"
                    onClick={closeEditItemsView}
                    type="button"
                  >
                    Back to Modules
                  </button>
                  <p className="mb-0 text-sm text-slate-700">
                    Instructor: <span className="fw-semibold">{selectedModuleInstructorName}</span>
                  </p>
                </div>
                {!canEditSelectedModule ? (
                  <div className="alert alert-info mt-3 mb-0">
                    View only. Only the teacher who created this module can edit topics or publish changes.
                  </div>
                ) : null}
              </div>
              {canEditSelectedModule ? (
              <div className="col-xl-5">
                <div className="panel h-100">
                  <h3 className="h5 fw-bold mb-3">
                    {isEditingItem ? `Edit Topic in ${selectedModule.title}` : `Add Topic to ${selectedModule.title}`}
                  </h3>
                  <form className="vstack gap-3" onSubmit={onSaveItem}>
                    <div>
                      <label className="form-label fw-semibold">Topic Type</label>
                      <select
                        className="form-select"
                        onChange={(event) => setItemType(event.target.value as BuilderItemType)}
                        disabled={isEditingItem}
                        value={itemType}
                      >
                        {ITEM_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {isEditingItem ? (
                        <div className="form-text">Topic type cannot be changed while editing. Delete and recreate if needed.</div>
                      ) : null}
                    </div>

                    <div>
                      <label className="form-label fw-semibold">Title</label>
                      <input
                        className="form-control"
                        onChange={(event) => setItemTitle(event.target.value)}
                        required
                        value={itemTitle}
                      />
                    </div>

                    <div>
                      <label className="form-label fw-semibold">Instructions</label>
                      <textarea
                        className="form-control"
                        onChange={(event) => setItemInstructions(event.target.value)}
                        rows={3}
                        value={itemInstructions}
                      />
                    </div>

                    {itemType === "readable" ? (
                      <>
                        <div>
                          <label className="form-label fw-semibold">Introduction / Learning Material Content</label>
                          <textarea
                            className="form-control"
                            onChange={(event) => setItemContent(event.target.value)}
                            rows={5}
                            value={itemContent}
                          />
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Learning Material Link (Optional)</label>
                          <input
                            className="form-control"
                            onChange={(event) => setReadableResourceLink(event.target.value)}
                            placeholder="Paste link (example: https://youtu.be/...)"
                            type="url"
                            value={readableResourceLink}
                          />
                          <div className="form-text">
                            This link will appear in the student topic page as additional reference.
                          </div>
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Learning Material Display Format</label>
                          <select
                            className="form-select"
                            onChange={(event) =>
                              setReadablePresentationMode(event.target.value as ReadablePresentationMode)
                            }
                            value={readablePresentationMode}
                          >
                            {READABLE_PRESENTATION_OPTIONS.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                          <div className="form-text">
                            Leave it on No Selection to auto-layout resources.
                          </div>
                        </div>
                        <div>
                          <label className="form-label fw-semibold">Upload Materials (One Drop Area)</label>
                          <div
                            className={`rounded-3 border p-3 ${
                              isReadableDropActive
                                ? "border-primary bg-brandBlueLight"
                                : "border-brandBorder bg-white"
                            }`}
                            onDragLeave={onReadableDragLeave}
                            onDragOver={onReadableDragOver}
                            onDrop={onReadableDrop}
                          >
                            <p className="mb-2 text-sm fw-semibold text-slate-800">
                              Drag and drop many files here
                            </p>
                            <input
                              accept={READABLE_ACCEPT}
                              className="form-control"
                              multiple
                              onChange={onReadableFileSelect}
                              type="file"
                            />
                            <div className="form-text">
                              Supported: videos, images, PDF, PPT/PPTX, DOC/DOCX, spreadsheets, text, zip.
                            </div>
                            {isEditingItem && existingReadableAttachmentCount > 0 ? (
                              <p className="mb-0 mt-2 small text-slate-700">
                                Existing attachments: <span className="fw-semibold">{existingReadableAttachmentCount}</span>.
                                New uploads will be added after existing files.
                              </p>
                            ) : null}
                          </div>
                          {readableFiles.length > 0 ? (
                            <div className="vstack gap-2 mt-2">
                              {readableFiles.map((entry, index) => (
                                <div
                                  className="d-flex flex-wrap align-items-center justify-content-between gap-2 rounded-2 border border-brandBorder bg-white px-2 py-2"
                                  key={entry.id}
                                >
                                  <div className="flex-grow-1" style={{ minWidth: "260px" }}>
                                    <p className="small text-slate-800 mb-1">
                                      <span className="fw-semibold me-1">{index + 1}.</span>
                                      {entry.file.name}
                                    </p>
                                    <input
                                      className="form-control form-control-sm"
                                      onChange={(event) =>
                                        updateReadableFileLabel(index, event.target.value)
                                      }
                                      placeholder="Card label (example: A)"
                                      type="text"
                                      value={entry.label}
                                    />
                                  </div>
                                  <div className="btn-group btn-group-sm" role="group">
                                    <button
                                      className="btn btn-outline-secondary"
                                      disabled={index === 0}
                                      onClick={() => moveReadableFile(index, "up")}
                                      type="button"
                                    >
                                      Up
                                    </button>
                                    <button
                                      className="btn btn-outline-secondary"
                                      disabled={index === readableFiles.length - 1}
                                      onClick={() => moveReadableFile(index, "down")}
                                      type="button"
                                    >
                                      Down
                                    </button>
                                    <button
                                      className="btn btn-outline-danger"
                                      onClick={() => removeReadableFile(index)}
                                      type="button"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    {itemType === "multiple_choice_assessment" ? (
                      <>
                        <div className="d-flex justify-content-between align-items-center">
                          <label className="form-label fw-semibold mb-0">Questions</label>
                        </div>
                        <div className="vstack gap-3">
                          {mcqQuestions.map((question, questionIndex) => {
                            const questionKey = normalizeQuestionKey(question.id, questionIndex);
                            const existingQuestionPrompt =
                              isEditingItem && editingItem?.item_type === "multiple_choice_assessment"
                                ? getMcqQuestionPromptAsset(editingItemAttachments, questionKey)
                                : null;
                            return (
                              <div className="card border-brandBorder" key={question.id}>
                                <div className="card-body vstack gap-2">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <p className="mb-0 fw-semibold">Question {questionIndex + 1}</p>
                                    <div className="d-flex gap-2">
                                      {questionIndex === mcqQuestions.length - 1 ? (
                                        <button
                                          className="btn btn-outline-primary btn-sm"
                                          onClick={() => addMcqQuestion(questionIndex)}
                                          type="button"
                                        >
                                          Add Question
                                        </button>
                                      ) : null}
                                      <button
                                        className="btn btn-outline-danger btn-sm"
                                        disabled={mcqQuestions.length <= 1}
                                        onClick={() => removeMcqQuestion(questionIndex)}
                                        type="button"
                                      >
                                        Remove Question
                                      </button>
                                    </div>
                                  </div>
                                  <input
                                    className="form-control"
                                    onChange={(event) => updateMcqQuestionText(questionIndex, event.target.value)}
                                    placeholder={`Type question ${questionIndex + 1}`}
                                    value={question.question}
                                  />
                                  <div>
                                    <label className="form-label fw-semibold mb-1">Question Image (Optional)</label>
                                    <input
                                      accept={MCQ_PROMPT_ACCEPT}
                                      className="form-control"
                                      onChange={(event) =>
                                        setMcqQuestionPromptFile(questionIndex, event.target.files?.[0] ?? null)
                                      }
                                      type="file"
                                    />
                                    <div className="form-text">
                                      This image will be shown only for Question {questionIndex + 1}.
                                    </div>
                                    {question.promptFile ? (
                                      <p className="mb-0 mt-1 small text-slate-700">
                                        Selected image: <span className="fw-semibold">{question.promptFile.name}</span>
                                      </p>
                                    ) : existingQuestionPrompt ? (
                                      <p className="mb-0 mt-1 small text-slate-700">
                                        Current image:{" "}
                                        <span className="fw-semibold">{existingQuestionPrompt.resource_file_name}</span>
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="d-flex justify-content-between align-items-center">
                                    <p className="mb-0 fw-semibold">Choices</p>
                                    <button
                                      className="btn btn-outline-secondary btn-sm"
                                      onClick={() => addMcqChoice(questionIndex)}
                                      type="button"
                                    >
                                      Add Choice
                                    </button>
                                  </div>
                                  <div className="vstack gap-2">
                                    {question.choices.map((choice, choiceIndex) => (
                                      <div className="input-group" key={`${question.id}-choice-${choiceIndex}`}>
                                        <span className="input-group-text">
                                          <input
                                            checked={question.correctIndex === choiceIndex}
                                            className="form-check-input mt-0"
                                            onChange={() => setMcqQuestionCorrect(questionIndex, choiceIndex)}
                                            title="Correct answer"
                                            type="radio"
                                          />
                                        </span>
                                        <input
                                          className="form-control"
                                          onChange={(event) =>
                                            updateMcqChoice(questionIndex, choiceIndex, event.target.value)
                                          }
                                          placeholder={`Choice ${choiceIndex + 1}`}
                                          value={choice}
                                        />
                                        <button
                                          className="btn btn-outline-danger"
                                          disabled={question.choices.length <= 2}
                                          onClick={() => removeMcqChoice(questionIndex, choiceIndex)}
                                          type="button"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="mb-0 small text-slate-600 fw-normal">
                                    Click the radio button to select the correct answer for this question.
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          <p className="mb-0 text-xs text-slate-600">
                            One topic can contain multiple questions. Students must answer all before submission.
                          </p>
                        </div>
                      </>
                    ) : null}

                    {itemType === "identification_assessment" ? (
                      <>
                        <div className="d-flex justify-content-between align-items-center">
                          <label className="form-label fw-semibold mb-0">Identification Questions</label>
                        </div>
                        <div className="vstack gap-3">
                          {identificationQuestions.map((question, questionIndex) => {
                            const questionKey = normalizeQuestionKey(question.id, questionIndex);
                            const existingQuestionPrompt =
                              isEditingItem && editingItem?.item_type === "identification_assessment"
                                ? getIdentificationQuestionPromptAsset(editingItemAttachments, questionKey)
                                : null;
                            return (
                              <div className="card border-brandBorder" key={question.id}>
                                <div className="card-body vstack gap-2">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <p className="mb-0 fw-semibold">Question {questionIndex + 1}</p>
                                    <div className="d-flex gap-2">
                                      {questionIndex === identificationQuestions.length - 1 ? (
                                        <button
                                          className="btn btn-outline-primary btn-sm"
                                          onClick={() => addIdentificationQuestion(questionIndex)}
                                          type="button"
                                        >
                                          Add Question
                                        </button>
                                      ) : null}
                                      <button
                                        className="btn btn-outline-danger btn-sm"
                                        disabled={identificationQuestions.length <= 1}
                                        onClick={() => removeIdentificationQuestion(questionIndex)}
                                        type="button"
                                      >
                                        Remove Question
                                      </button>
                                    </div>
                                  </div>
                                  <input
                                    className="form-control"
                                    onChange={(event) =>
                                      updateIdentificationQuestionText(questionIndex, event.target.value)
                                    }
                                    placeholder={`Type identification question ${questionIndex + 1}`}
                                    value={question.question}
                                  />
                                  <div>
                                    <label className="form-label fw-semibold mb-1">
                                      Prompt Media (Image or Video)
                                    </label>
                                    <input
                                      accept={IDENTIFICATION_PROMPT_ACCEPT}
                                      className="form-control"
                                      onChange={(event) =>
                                        setIdentificationQuestionPromptFile(
                                          questionIndex,
                                          event.target.files?.[0] ?? null
                                        )
                                      }
                                      type="file"
                                    />
                                    <div className="form-text">
                                      This media will be shown only for Question {questionIndex + 1}.
                                    </div>
                                    {question.promptFile ? (
                                      <p className="mb-0 mt-1 small text-slate-700">
                                        Selected media: <span className="fw-semibold">{question.promptFile.name}</span>
                                      </p>
                                    ) : existingQuestionPrompt ? (
                                      <p className="mb-0 mt-1 small text-slate-700">
                                        Current media:{" "}
                                        <span className="fw-semibold">{existingQuestionPrompt.resource_file_name}</span>
                                      </p>
                                    ) : null}
                                  </div>
                                  <div>
                                    <label className="form-label fw-semibold mb-1">Correct Answer</label>
                                    <input
                                      className="form-control"
                                      onChange={(event) =>
                                        updateIdentificationCorrectAnswer(questionIndex, event.target.value)
                                      }
                                      placeholder="Example: LETTER B"
                                      value={question.correctAnswer}
                                    />
                                  </div>
                                  <div>
                                    <label className="form-label fw-semibold mb-1">Accepted Answers (Optional)</label>
                                    <textarea
                                      className="form-control"
                                      onChange={(event) =>
                                        updateIdentificationAcceptedAnswers(questionIndex, event.target.value)
                                      }
                                      placeholder="Add aliases separated by comma or new line."
                                      rows={2}
                                      value={question.acceptedAnswersText}
                                    />
                                  </div>
                                  <p className="mb-0 small text-slate-600 fw-normal">
                                    Students will type their answer for this question.
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          <p className="mb-0 text-xs text-slate-600">
                            Identification is typing-only. No multiple-choice options are shown to students.
                          </p>
                        </div>
                      </>
                    ) : null}

                    {itemType === "signing_lab_assessment" ? (
                      <>
                        <div>
                          <label className="form-label fw-semibold">Camera Interface Type</label>
                          <select
                            className="form-select"
                            onChange={(event) => setSigningLabMode(event.target.value as RecognitionMode)}
                            value={signingLabMode}
                          >
                            {LAB_MODE_OPTIONS.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {signingLabMode === "numbers" ? (
                          <div>
                            <label className="form-label fw-semibold">Numbers Range</label>
                            <select
                              className="form-select"
                              onChange={(event) =>
                                setSigningLabNumbersRange(event.target.value as NumbersCategory)
                              }
                              value={signingLabNumbersRange}
                            >
                              {NUMBER_RANGE_OPTIONS.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                            <div className="form-text">
                              Students must choose this range first in the camera interface (example: 11-20).
                            </div>
                          </div>
                        ) : null}
                        {signingLabMode === "words" ? (
                          <div>
                            <label className="form-label fw-semibold">Words Classification</label>
                            <select
                              className="form-select"
                              onChange={(event) =>
                                setSigningLabWordsCategory(event.target.value as WordsCategory)
                              }
                              value={signingLabWordsCategory}
                            >
                              {WORD_CATEGORY_OPTIONS.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                            <div className="form-text">
                              This uses the same word classifications available in the free signing lab.
                            </div>
                          </div>
                        ) : null}
                        <div className="rounded-3 border border-brandBorder bg-brandOffWhite p-3">
                          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                            <p className="mb-0 fw-semibold">Camera Interface Entries</p>
                            <span className="small text-slate-700">
                              {signingLabEntries.length} {signingLabEntries.length === 1 ? "entry" : "entries"}
                            </span>
                          </div>
                          <div className="vstack gap-3">
                            {signingLabEntries.map((entry, entryIndex) => (
                              <div className="card border-brandBorder" key={entry.id}>
                                <div className="card-body vstack gap-2">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <p className="mb-0 fw-semibold">Entry {entryIndex + 1}</p>
                                    <div className="d-flex gap-2">
                                      {entryIndex === signingLabEntries.length - 1 ? (
                                        <button
                                          className="btn btn-outline-primary btn-sm"
                                          onClick={() => addSigningLabEntry(entryIndex)}
                                          type="button"
                                        >
                                          Add Entry
                                        </button>
                                      ) : null}
                                      <button
                                        className="btn btn-outline-danger btn-sm"
                                        disabled={signingLabEntries.length <= 1}
                                        onClick={() => removeSigningLabEntry(entryIndex)}
                                        type="button"
                                      >
                                        Remove Entry
                                      </button>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="form-label fw-semibold mb-1">Instruction</label>
                                    <input
                                      className="form-control"
                                      onChange={(event) =>
                                        updateSigningLabEntryPrompt(entryIndex, event.target.value)
                                      }
                                      placeholder="Example: Sign the word GOOD MORNING."
                                      value={entry.prompt}
                                    />
                                  </div>
                                  <div>
                                    <label className="form-label fw-semibold mb-1">Expected Word / Phrase</label>
                                    <input
                                      className="form-control"
                                      onChange={(event) =>
                                        updateSigningLabEntryExpectedAnswer(entryIndex, event.target.value)
                                      }
                                      placeholder="Example: GOOD MORNING"
                                      value={entry.expectedAnswer}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-3 border border-brandBorder bg-white p-3">
                          <p className="mb-2 fw-semibold">Completion Requirement</p>
                          <div className="form-check mb-2">
                            <input
                              checked={signingLabRequireAll}
                              className="form-check-input"
                              id="signing-require-all"
                              onChange={(event) => setSigningLabRequireAll(event.target.checked)}
                              type="checkbox"
                            />
                            <label className="form-check-label" htmlFor="signing-require-all">
                              Require all entries before submission
                            </label>
                          </div>
                          {!signingLabRequireAll ? (
                            <div>
                              <label className="form-label fw-semibold mb-1">Minimum entries required</label>
                              <input
                                className="form-control"
                                max={signingLabEntries.length}
                                min={1}
                                onChange={(event) => {
                                  const parsed = Number.parseInt(event.target.value, 10);
                                  if (Number.isFinite(parsed)) {
                                    if (signingLabEntries.length <= 1 && parsed > 1) {
                                      notifyInfo("Add entry first.");
                                      setSigningLabRequiredCount(1);
                                      return;
                                    }
                                    setSigningLabRequiredCount(
                                      Math.max(1, Math.min(parsed, Math.max(1, signingLabEntries.length)))
                                    );
                                    return;
                                  }
                                  setSigningLabRequiredCount(1);
                                }}
                                type="number"
                                value={Math.max(1, Math.min(signingLabRequiredCount, Math.max(1, signingLabEntries.length)))}
                              />
                              <div className="form-text">
                                Students can submit after answering at least this many entries.
                              </div>
                            </div>
                          ) : (
                            <p className="mb-0 small text-slate-700">
                              Students must answer all {signingLabEntries.length} entries.
                            </p>
                          )}
                        </div>
                      </>
                    ) : null}

                    {itemType === "upload_assessment" ? (
                      <div className="rounded-3 border border-brandBorder bg-brandOffWhite p-3">
                        <p className="mb-2 fw-semibold">Student Upload Assessment</p>
                        <div className="alert alert-danger py-2 px-3 mb-3 small fw-semibold" role="note">
                          Important: Add a clear upload instruction and rubric.
                        </div>
                        <div className="mb-3">
                          <label className="form-label fw-semibold mb-1">Reference Link (Optional)</label>
                          <input
                            className="form-control"
                            onChange={(event) => setUploadReferenceLink(event.target.value)}
                            placeholder="Paste link (example: https://youtu.be/...)"
                            type="url"
                            value={uploadReferenceLink}
                          />
                          <div className="form-text">
                            Students will see this as guidance before uploading their files.
                            </div>
                          </div>
                        <div className="mb-3">
                          <label className="form-label fw-semibold mb-1">
                            Additional Learning Materials (Optional)
                          </label>
                          <input
                            accept={READABLE_ACCEPT}
                            className="form-control"
                            multiple
                            onChange={(event) =>
                              setUploadSupportFiles(
                                Array.from(event.target.files ?? [])
                              )
                            }
                            type="file"
                          />
                          <div className="form-text">
                            Upload optional guides for students (video, image, PDF, PPT, DOC, and related files).
                          </div>
                          {isEditingItem && editingItem ? (
                            <div className="form-text">
                              Existing uploaded materials:{" "}
                              <span className="fw-semibold">{getItemAttachments(editingItem).length}</span>
                            </div>
                          ) : null}
                          {uploadSupportFiles.length > 0 ? (
                            <ul className="mt-2 mb-0 small text-slate-700">
                              {uploadSupportFiles.map((file) => (
                                <li key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="vstack gap-3 mb-3">
                          {uploadRubrics.map((rubric, rubricIndex) => (
                            <div className="card border-brandBorder" key={rubric.id}>
                              <div className="card-body vstack gap-2">
                                <div className="d-flex justify-content-between align-items-center">
                                  <p className="mb-0 fw-semibold">Rubric {rubricIndex + 1}</p>
                                  <div className="d-flex gap-2">
                                    {rubricIndex === uploadRubrics.length - 1 ? (
                                      <button
                                        className="btn btn-outline-primary btn-sm"
                                        onClick={() => addUploadRubric(rubricIndex)}
                                        type="button"
                                      >
                                        Add Rubric
                                      </button>
                                    ) : null}
                                    <button
                                      className="btn btn-outline-danger btn-sm"
                                      disabled={uploadRubrics.length <= 1}
                                      onClick={() => removeUploadRubric(rubricIndex)}
                                      type="button"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <label className="form-label fw-semibold mb-1">Criteria</label>
                                  <input
                                    className="form-control"
                                    onChange={(event) =>
                                      updateUploadRubricCriterion(rubricIndex, event.target.value)
                                    }
                                    placeholder="Example: Correct handshape for A-Z"
                                    value={rubric.criterion}
                                  />
                                </div>
                                <div>
                                  <label className="form-label fw-semibold mb-1">
                                    Weight (%)
                                  </label>
                                  <div className="d-flex align-items-center gap-2">
                                    <input
                                      className="form-range flex-grow-1"
                                      max={100}
                                      min={0}
                                      onChange={(event) =>
                                        updateUploadRubricWeight(
                                          rubricIndex,
                                          Number.parseFloat(event.target.value) || 0
                                        )
                                      }
                                      step={1}
                                      type="range"
                                      value={rubric.weightPercent}
                                    />
                                    <input
                                      className="form-control form-control-sm"
                                      max={100}
                                      min={0}
                                      onChange={(event) =>
                                        updateUploadRubricWeight(
                                          rubricIndex,
                                          Number.parseFloat(event.target.value) || 0
                                        )
                                      }
                                      step={1}
                                      style={{ width: "80px" }}
                                      type="number"
                                      value={rubric.weightPercent}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div>
                          <label className="form-label fw-semibold mb-1">Overall Score (%)</label>
                          <div className="d-flex align-items-center gap-2">
                            <input
                              className="form-range flex-grow-1"
                              max={100}
                              min={1}
                              onChange={(event) => {
                                const parsed = Number.parseFloat(event.target.value);
                                if (Number.isFinite(parsed) && parsed > 0) {
                                  setUploadMaxPoints(Math.min(Math.max(parsed, 1), 100));
                                  return;
                                }
                                setUploadMaxPoints(100);
                              }}
                              step={1}
                              type="range"
                              value={uploadMaxPoints}
                            />
                            <span className="badge text-bg-light border">{uploadMaxPoints}%</span>
                          </div>
                          <div className="form-text">
                            Students can upload videos/files. Teacher checks and scores using your rubric.
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="d-flex flex-wrap gap-2">
                      <button className="btn btn-primary" disabled={isSavingItem} type="submit">
                        {isSavingItem ? "Saving..." : isEditingItem ? "Update Topic" : "Add Topic"}
                      </button>
                      {isEditingItem ? (
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => clearItemBuilder()}
                          type="button"
                        >
                          Cancel Edit
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
              ) : null}

              <div className={canEditSelectedModule ? "col-xl-7" : "col-12"}>
                <div className="panel h-100">
                  <h3 className="h5 fw-bold mb-3">Module Topics</h3>
                  <div className="vstack gap-3">
                    {selectedModule.items.map((item) => {
                      const attachments = getItemAttachments(item);
                      const promptMedia = getPromptMedia(item);
                      const signingConfig = getSigningLabConfig(item);
                      const effectiveItemStatus = selectedModule.is_published ? "published" : "unpublished";
                      return (
                        <article className="card border-brandBorder shadow-sm" key={item.id}>
                          <div className="card-body">
                            <div className="d-flex flex-wrap justify-content-between gap-3">
                              <div>
                                <p className="mb-1 text-uppercase text-xs tracking-[0.16em] text-slate-500">
                                  Topic {item.order_index} - {displayItemTypeLabel(item.item_type)}
                                </p>
                                <h4 className="h6 fw-bold mb-1">{item.title}</h4>
                                <p className="mb-0 text-sm text-slate-700">
                                  {item.instructions || "No instructions yet."}
                                </p>
                              </div>
                              <span
                                className={`badge rounded-pill border d-inline-flex align-items-center justify-content-center px-2 py-1 fw-semibold text-nowrap ${
                                  effectiveItemStatus === "published"
                                    ? "bg-success-subtle text-success border-success-subtle"
                                    : "bg-warning-subtle text-warning-emphasis border-warning-subtle"
                                }`}
                                style={{ fontSize: "0.68rem", minWidth: "74px" }}
                              >
                                {effectiveItemStatus === "published"
                                  ? "Published"
                                  : "Unpublished"}
                              </span>
                            </div>

                            {item.content_text ? (
                              <p className="mt-3 mb-0 rounded-3 bg-brandOffWhite px-3 py-2 text-sm text-slate-700">
                                {item.content_text}
                              </p>
                            ) : null}

                            {attachments.length > 0 ? (
                              <p className="mt-3 mb-0 text-sm text-slate-700">
                                Attachments: <span className="fw-semibold">{attachments.length}</span>
                              </p>
                            ) : null}
                            {item.item_type === "readable" ? (
                              <p className="mt-1 mb-0 text-sm text-slate-700">
                                Format:{" "}
                                <span className="fw-semibold">
                                  {readableModeLabel(parseReadablePresentationMode(item.config.presentation_mode))}
                                </span>
                              </p>
                            ) : null}

                            {promptMedia ? (
                              <p className="mt-2 mb-0 text-sm text-slate-700">
                                Prompt media: <span className="fw-semibold">{promptMedia.resource_file_name}</span>
                              </p>
                            ) : null}
                            {signingConfig ? (
                              <div className="mt-2 text-sm text-slate-700">
                                <p className="mb-1">
                                  Camera type:{" "}
                                  <span className="fw-semibold">{displayType(signingConfig.mode)}</span>
                                </p>
                                {signingConfig.mode === "numbers" ? (
                                  <p className="mb-1">
                                    Numbers range:{" "}
                                    <span className="fw-semibold">
                                      {displayNumbersRangeLabel(signingConfig.numbersCategory)}
                                    </span>
                                  </p>
                                ) : null}
                                {signingConfig.mode === "words" ? (
                                  <p className="mb-1">
                                    Words category:{" "}
                                    <span className="fw-semibold">
                                      {displayWordsCategoryLabel(signingConfig.wordsCategory)}
                                    </span>
                                  </p>
                                ) : null}
                                <p className="mb-1">
                                  Entries: <span className="fw-semibold">{signingConfig.entries.length}</span>
                                </p>
                                <p className="mb-0">
                                  Requirement:{" "}
                                  <span className="fw-semibold">
                                    {signingConfig.requireAll
                                      ? `All ${signingConfig.entries.length} entries`
                                      : `${signingConfig.requiredCount} of ${signingConfig.entries.length} entries`}
                                  </span>
                                </p>
                              </div>
                            ) : null}
                            {item.item_type === "upload_assessment" ? (
                              <div className="mt-2 text-sm text-slate-700">
                                <p className="mb-1">
                                  Rubric criteria:{" "}
                                  <span className="fw-semibold">
                                    {(() => {
                                      const rawItems = item.config.rubric_items;
                                      return Array.isArray(rawItems) ? rawItems.length : 0;
                                    })()}
                                  </span>
                                </p>
                                <p className="mb-1">
                                  Overall score:{" "}
                                  <span className="fw-semibold">
                                    {(() => {
                                      const rawValue = item.config.max_points;
                                      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
                                        return rawValue;
                                      }
                                      if (typeof rawValue === "string") {
                                        const parsed = Number.parseFloat(rawValue);
                                        if (Number.isFinite(parsed)) {
                                          return parsed;
                                        }
                                      }
                                      return 100;
                                    })()}
                                  </span>
                                  %
                                </p>
                                <p className="mb-0">
                                  Rubric summary:{" "}
                                  <span className="fw-semibold">
                                    {typeof item.config.rubric_text === "string" && item.config.rubric_text.trim()
                                      ? item.config.rubric_text
                                      : "No rubric yet."}
                                  </span>
                                </p>
                                {typeof item.config.reference_link === "string" &&
                                item.config.reference_link.trim() ? (
                                  <p className="mb-0 mt-1">
                                    Reference link:{" "}
                                    <a
                                      className="fw-semibold text-primary text-break"
                                      href={normalizeExternalLink(item.config.reference_link)}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {normalizeExternalLink(item.config.reference_link)}
                                    </a>
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="d-flex flex-wrap gap-2 mt-3">
                              <button
                                className="btn btn-sm btn-secondary text-white"
                                onClick={() => openPreview(item)}
                                type="button"
                              >
                                Preview
                              </button>
                              {canEditSelectedModule ? (
                                <>
                                  <button
                                    className="btn btn-sm btn-primary text-white"
                                    onClick={() => beginEditItem(item)}
                                    type="button"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger text-white"
                                    disabled={deletingItemId === item.id}
                                    onClick={() => void onDeleteItem(item)}
                                    type="button"
                                  >
                                    {deletingItemId === item.id ? "Deleting..." : "Delete"}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {selectedModule.items.length === 0 ? (
                      <p className="mb-0 text-sm text-slate-600">
                        {canEditSelectedModule
                          ? "No topics yet. Add your first topic."
                          : "No topics available in this module yet."}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="mb-0 text-sm text-slate-700">
                Click Edit Topics or View Topics on a module to open the module details.
              </p>
            </div>
          )}
        </>
      ) : null}

      {showCreateModuleModal ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Module</h5>
                <button
                  aria-label="Close"
                  className="btn-close"
                  disabled={isCreatingModule}
                  onClick={() => setShowCreateModuleModal(false)}
                  type="button"
                />
              </div>
              <form onSubmit={onCreateModule}>
                <div className="modal-body vstack gap-3">
                  <div>
                    <label className="form-label fw-semibold">Module Title</label>
                    <input
                      className="form-control"
                      onChange={(event) => setNewModuleTitle(event.target.value)}
                      required
                      value={newModuleTitle}
                    />
                  </div>
                  <div>
                    <label className="form-label fw-semibold">Description</label>
                    <textarea
                      className="form-control"
                      onChange={(event) => setNewModuleDescription(event.target.value)}
                      rows={4}
                      value={newModuleDescription}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    className="btn btn-outline-secondary"
                    disabled={isCreatingModule}
                    onClick={() => setShowCreateModuleModal(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" disabled={isCreatingModule} type="submit">
                    {isCreatingModule ? "Saving..." : "Add Module"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {activeSubmissionModule ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <h5 className="modal-title">
                    Upload Submissions - {activeSubmissionModule.title}
                  </h5>
                  <p className="mb-0 small text-slate-700">
                    Batch: {activeSubmissionBatchName ?? "N/A"}
                  </p>
                </div>
                <button aria-label="Close" className="btn-close" onClick={closeSubmissionsView} type="button" />
              </div>
              <div className="modal-body">
                {activeSubmissionItemId === null ? (
                  <>
                    {isLoadingSubmissionAssessments ? (
                      <p className="mb-0 text-sm text-slate-700">Loading upload assessments...</p>
                    ) : submissionAssessments.length === 0 ? (
                      <p className="mb-0 text-sm text-slate-700">
                        No upload assessment topics found in this module yet.
                      </p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table align-middle">
                          <thead>
                            <tr>
                              <th>Topic</th>
                              <th>Created By</th>
                              <th>Submissions</th>
                              <th>Access</th>
                              <th className="text-end">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {submissionAssessments.map((assessment) => (
                              <tr key={assessment.item_id}>
                                <td>
                                  <p className="mb-0 fw-semibold">
                                    Topic {assessment.item_order_index}: {assessment.item_title}
                                  </p>
                                </td>
                                <td>
                                  <p className="mb-0 text-sm text-slate-700">
                                    {assessment.assessment_creator_name?.trim() || "Unknown Instructor"}
                                  </p>
                                </td>
                                <td>
                                  <span className="badge text-bg-light border border-brandBorder text-slate-700">
                                    {assessment.submitted_students}/{assessment.total_students} submitted
                                  </span>
                                </td>
                                <td>
                                  {assessment.can_grade ? (
                                    <span className="badge text-bg-success">Can Grade</span>
                                  ) : (
                                    <span className="badge text-bg-secondary">View Only</span>
                                  )}
                                </td>
                                <td className="text-end">
                                  <button
                                    className="btn btn-sm btn-outline-primary fw-semibold"
                                    onClick={() => void openAssessmentSubmissions(assessment)}
                                    type="button"
                                  >
                                    View Submissions
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="vstack gap-3">
                    <div className="rounded-3 border border-brandBorder bg-brandOffWhite p-3">
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                        <div>
                          <p className="mb-1 text-xs uppercase tracking-[0.16em] text-slate-500">Selected Assessment</p>
                          <p className="mb-0 fw-semibold">
                            Topic {activeSubmissionAssessment?.item_order_index}:{" "}
                            {activeSubmissionAssessment?.item_title}
                          </p>
                          <p className="mb-0 small text-slate-700">
                            Created by {activeSubmissionAssessment?.assessment_creator_name?.trim() || "Unknown Instructor"}
                          </p>
                        </div>
                        {activeSubmissionCanGrade ? (
                          <span className="badge text-bg-success">Creator Access</span>
                        ) : (
                          <span className="badge text-bg-secondary">View Only</span>
                        )}
                      </div>
                    </div>

                    {isLoadingSubmissions ? (
                      <p className="mb-0 text-sm text-slate-700">Loading submissions...</p>
                    ) : moduleSubmissions.length === 0 ? (
                      <p className="mb-0 text-sm text-slate-700">No student records found for this assessment.</p>
                    ) : (
                      <div className="vstack gap-3">
                        {moduleSubmissions.map((row) => (
                          <article className="rounded-3 border border-brandBorder bg-white p-3" key={`${row.item_id}-${row.student_id}`}>
                            <div className="d-flex flex-wrap justify-content-between gap-2">
                              <div>
                                <p className="mb-0 fw-semibold">{row.student_name}</p>
                                <p className="mb-0 small text-muted">{row.student_email || "No email"}</p>
                              </div>
                              <div className="text-end">
                                <span
                                  className={`badge ${
                                    row.status === "completed" ? "text-bg-success" : "text-bg-secondary"
                                  }`}
                                >
                                  {row.status === "completed" ? "Submitted" : "Not Submitted"}
                                </span>
                                {row.submitted_at ? (
                                  <p className="mb-0 small text-muted mt-1">
                                    {new Date(row.submitted_at).toLocaleString()}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3">
                              <p className="mb-1 small fw-semibold text-uppercase text-slate-500">Files</p>
                              {row.files.length > 0 ? (
                                <div className="d-flex flex-wrap gap-2">
                                  {row.files.map((file, index) => (
                                    <a
                                      className="small text-primary text-decoration-underline"
                                      href={resolveAssetUrl(file)}
                                      key={`${row.item_id}-${row.student_id}-${index}`}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {file.resource_file_name}
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <p className="mb-0 small text-muted">No file yet</p>
                              )}
                            </div>

                            <div className="mt-3">
                              <p className="mb-1 small fw-semibold text-uppercase text-slate-500">
                                Student Private Note
                              </p>
                              <div className="rounded-3 border border-brandBorder bg-brandOffWhite px-3 py-2">
                                <p className="mb-0 small text-slate-700">
                                  {row.student_note?.trim() || "No note provided."}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 row g-3">
                              <div className="col-12 col-lg-3">
                                <p className="mb-1 small fw-semibold text-uppercase text-slate-500">Score</p>
                                {row.progress_id ? (
                                  <button
                                    className="btn btn-sm btn-outline-primary w-100"
                                    disabled={gradingProgressId === row.progress_id || !row.can_grade}
                                    onClick={() => openRubricScorer(row)}
                                    type="button"
                                  >
                                    {row.score_percent !== null && row.score_percent !== undefined
                                      ? `${Number(row.score_percent).toFixed(1)}%`
                                      : row.can_grade
                                        ? "Rubric Scorer"
                                        : "No Score"}
                                  </button>
                                ) : (
                                  <span className="small text-muted">-</span>
                                )}
                              </div>
                              <div className="col-12 col-lg-6">
                                <label className="form-label mb-1 small fw-semibold text-uppercase text-slate-500">
                                  Feedback
                                </label>
                                {row.progress_id ? (
                                  <textarea
                                    className="form-control form-control-sm"
                                    onChange={(event) =>
                                      setFeedbackDraftByProgressId((current) => ({
                                        ...current,
                                        [row.progress_id as number]: event.target.value,
                                      }))
                                    }
                                    readOnly={!row.can_grade}
                                    rows={2}
                                    value={feedbackDraftByProgressId[row.progress_id] ?? ""}
                                  />
                                ) : (
                                  <span className="small text-muted">-</span>
                                )}
                              </div>
                              <div className="col-12 col-lg-3 d-flex align-items-end">
                                {row.progress_id ? (
                                  row.can_grade ? (
                                    <button
                                      className="btn btn-sm btn-primary w-100 fw-semibold"
                                      disabled={gradingProgressId === row.progress_id}
                                      onClick={() => void onSaveSubmissionRow(row)}
                                      type="button"
                                    >
                                      {gradingProgressId === row.progress_id ? "Returning..." : "Return to Student"}
                                    </button>
                                  ) : (
                                    <span className="badge text-bg-secondary w-100 py-2">View Only</span>
                                  )
                                ) : (
                                  <span className="small text-muted">Waiting</span>
                                )}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {activeSubmissionItemId !== null ? (
                  <button className="btn btn-outline-primary" onClick={backToAssessmentList} type="button">
                    Back to Assessments
                  </button>
                ) : null}
                <button className="btn btn-outline-secondary" onClick={closeSubmissionsView} type="button">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeRubricSubmission && activeRubricTotals ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Rubric Scorer - {activeRubricSubmission.student_name}
                </h5>
                <button
                  aria-label="Close"
                  className="btn-close"
                  disabled={gradingProgressId === activeRubricSubmission.progress_id}
                  onClick={closeRubricScorer}
                  type="button"
                />
              </div>
              <div className="modal-body vstack gap-3">
                <div className="rounded-3 border border-brandBorder bg-brandOffWhite p-3">
                  <p className="mb-1 fw-semibold">{activeRubricSubmission.item_title}</p>
                  <p className="mb-0 text-sm text-slate-700">
                    Use each slider (0-100%) to score the criterion. Weighted total is computed automatically.
                  </p>
                </div>

                <div className="vstack gap-3">
                  {activeRubricTotals.criterionRows.map((criterion) => (
                    <div className="rounded-3 border border-brandBorder p-3" key={criterion.id}>
                      <div className="d-flex flex-wrap justify-content-between gap-2 align-items-center">
                        <p className="mb-0 fw-semibold">{criterion.criterion}</p>
                        <span className="badge text-bg-light border">
                          Weight: {criterion.weight_percent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="d-flex align-items-center gap-2 mt-3">
                        <input
                          className="form-range flex-grow-1"
                          max={100}
                          min={0}
                          onChange={(event) =>
                            setRubricAchievedByCriterionId((current) => ({
                              ...current,
                              [criterion.id]: Number.parseFloat(event.target.value) || 0,
                            }))
                          }
                          step={1}
                          type="range"
                          value={rubricAchievedByCriterionId[criterion.id] ?? 0}
                        />
                        <input
                          className="form-control form-control-sm"
                          max={100}
                          min={0}
                          onChange={(event) =>
                            setRubricAchievedByCriterionId((current) => ({
                              ...current,
                              [criterion.id]: Number.parseFloat(event.target.value) || 0,
                            }))
                          }
                          style={{ width: "90px" }}
                          type="number"
                          value={rubricAchievedByCriterionId[criterion.id] ?? 0}
                        />
                        <span className="badge text-bg-success-subtle border border-success-subtle text-success-emphasis">
                          +{criterion.contributedPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-3 border border-brandBorder bg-white p-3">
                  <div className="row g-2">
                    <div className="col-sm-6">
                      <p className="mb-1 text-uppercase text-muted small fw-semibold">Final Score Percent</p>
                      <p className="mb-0 fw-bold fs-5 text-brandBlue">
                        {activeRubricTotals.totalPercent.toFixed(2)}%
                      </p>
                    </div>
                    <div className="col-sm-6">
                      <p className="mb-1 text-uppercase text-muted small fw-semibold">Score Points</p>
                      <p className="mb-0 fw-bold fs-5 text-brandBlue">
                        {activeRubricTotals.scorePoints.toFixed(2)} / {activeRubricTotals.maxPoints.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {activeRubricSubmission.progress_id ? (
                  <div>
                    <label className="form-label fw-semibold">Feedback</label>
                    <textarea
                      className="form-control"
                      onChange={(event) =>
                        setFeedbackDraftByProgressId((current) => ({
                          ...current,
                          [activeRubricSubmission.progress_id as number]: event.target.value,
                        }))
                      }
                      rows={3}
                      value={feedbackDraftByProgressId[activeRubricSubmission.progress_id] ?? ""}
                    />
                  </div>
                ) : null}
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-outline-secondary"
                  disabled={gradingProgressId === activeRubricSubmission.progress_id}
                  onClick={closeRubricScorer}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={gradingProgressId === activeRubricSubmission.progress_id}
                  onClick={() => void onSaveRubricScore()}
                  type="button"
                >
                  {gradingProgressId === activeRubricSubmission.progress_id ? "Returning..." : "Return Rubric Score"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {previewItem ? (
        <div
          aria-modal="true"
          className="modal fade show d-block"
          role="dialog"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Preview: {previewItem.title}
                  <span className="text-muted ms-2 small">({displayItemTypeLabel(previewItem.item_type)})</span>
                </h5>
                <button aria-label="Close" className="btn-close" onClick={closePreview} type="button" />
              </div>
              <div className="modal-body">{renderItemPreviewBody(previewItem)}</div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closePreview} type="button">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
