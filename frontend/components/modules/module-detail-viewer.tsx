"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  detectOpenPalmFromImage,
  getModules,
  ModuleItem,
  predictSignFromImage,
  submitActivityAttempt,
} from "@/lib/api";

type AssessmentReportItemPayload = {
  itemKey: string;
  prompt?: string | null;
  expectedAnswer?: string | null;
  studentAnswer?: string | null;
  isCorrect?: boolean | null;
  confidence?: number | null;
  aiMetadata?: Record<string, unknown>;
};

type AssessmentReportPayload = {
  assessmentId: string;
  assessmentTitle: string;
  right: number;
  wrong: number;
  total: number;
  scorePercent: number;
  improvementAreas: string[];
  items?: AssessmentReportItemPayload[];
  source?: string;
  notes?: string | null;
  markModuleCompleted?: boolean;
};

export type ModuleViewerRole = "student" | "teacher";

type ModuleDetailViewerProps = {
  moduleId: number;
  viewerRole?: ModuleViewerRole;
  readOnly?: boolean;
  storageScope?: string;
  backHref?: string;
  backLabel?: string;
  headerTitle?: string;
  headerEyebrow?: string;
  readOnlyNote?: string;
};

type AssessmentSubmitHandler = (payload: AssessmentReportPayload) => Promise<boolean>;

async function persistAssessmentResult(
  onSubmitResult: AssessmentSubmitHandler | undefined,
  payload: AssessmentReportPayload
) {
  const saved = await onSubmitResult?.(payload);
  return saved ?? true;
}

function loadSessionValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function useSessionState<T>(key: string, initial: T) {
  const initialRef = useRef(initial);
  const [value, setValue] = useState<T>(() => loadSessionValue(key, initialRef.current));

  useEffect(() => {
    setValue(loadSessionValue(key, initialRef.current));
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage errors so the page remains usable.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

const MODULE1_AI_SIGN_IMAGES = [
  { letter: "A", src: "/module-assets/m1/ai/a.png" },
  { letter: "B", src: "/module-assets/m1/ai/b.png" },
  { letter: "C", src: "/module-assets/m1/ai/c.png" },
  { letter: "D", src: "/module-assets/m1/ai/d.png" },
  { letter: "E", src: "/module-assets/m1/ai/e.png" },
  { letter: "F", src: "/module-assets/m1/ai/f.png" },
  { letter: "G", src: "/module-assets/m1/ai/g.png" },
  { letter: "H", src: "/module-assets/m1/ai/h.png" },
  { letter: "I", src: "/module-assets/m1/ai/i.png" }
] as const;

const MODULE1_J_MOTION_VIDEO = "/module-assets/m1/motion/j.mp4";
const MODULE1_Z_MOTION_VIDEO = "/module-assets/m1/motion/z.mp4";

const MODULE1_JR_SIGN_IMAGES = [
  { letter: "J", src: "/module-assets/m1/ai/j.png" },
  { letter: "K", src: "/module-assets/m1/ai/k.png" },
  { letter: "L", src: "/module-assets/m1/ai/l.png" },
  { letter: "M", src: "/module-assets/m1/ai/m.png" },
  { letter: "N", src: "/module-assets/m1/ai/n.png" },
  { letter: "O", src: "/module-assets/m1/ai/o.png" },
  { letter: "P", src: "/module-assets/m1/ai/p.png" },
  { letter: "Q", src: "/module-assets/m1/ai/q.png" },
  { letter: "R", src: "/module-assets/m1/ai/r.png" }
] as const;

const MODULE1_SZ_SIGN_IMAGES = [
  { letter: "S", src: "/module-assets/m1/ai/s.png" },
  { letter: "T", src: "/module-assets/m1/ai/t.png" },
  { letter: "U", src: "/module-assets/m1/ai/u.png" },
  { letter: "V", src: "/module-assets/m1/ai/v.png" },
  { letter: "W", src: "/module-assets/m1/ai/w.png" },
  { letter: "X", src: "/module-assets/m1/ai/x.png" },
  { letter: "Y", src: "/module-assets/m1/ai/y.png" },
  { letter: "Z", src: "/module-assets/m1/ai/z.png" }
] as const;

const MODULE2_LESSON_VIDEOS: Record<string, { title: string; src: string }> = {
  "m2-l1": {
    title: "Numbers 1-10 Demo",
    src: "/module-assets/m2/videos/1-10.mp4"
  },
  "m2-l2": {
    title: "Numbers 11-20 Demo",
    src: "/module-assets/m2/videos/11-20.mp4"
  },
  "m2-l3": {
    title: "Numbers 21-30 Demo",
    src: "/module-assets/m2/videos/21-30.mp4"
  },
  "m2-l4": {
    title: "Numbers 31-40 Demo",
    src: "/module-assets/m2/videos/31-40.mp4"
  },
  "m2-l5": {
    title: "Numbers 41-50 Demo",
    src: "/module-assets/m2/videos/41-50.mp4"
  },
  "m2-l6": {
    title: "Shortcuts: 60, 70, 80, 90, 100",
    src: "/module-assets/m2/videos/60-70-80-90-100.mp4"
  }
};

const MODULE3_LESSON_VIDEOS: Record<string, { title: string; src: string }> = {
  "m3-l1": { title: "Daily Greetings Demo", src: "/module-assets/m3/videos/greetings.mp4" },
  "m3-l2": { title: "Check-In and Introduction Demo", src: "/module-assets/m3/videos/check-in.mp4" },
  "m3-l3": { title: "Courtesy and Parting Demo", src: "/module-assets/m3/videos/courtesy.mp4" }
};

const MODULE4_LESSON_VIDEOS: Record<string, { title: string; src: string }> = {
  "m4-l1": { title: "FATHER Demo", src: "/module-assets/m4/videos/father.mov" },
  "m4-l2": { title: "MOTHER Demo", src: "/module-assets/m4/videos/mother.mov" },
  "m4-l3": { title: "SON Demo", src: "/module-assets/m4/videos/son.mov" },
  "m4-l4": { title: "DAUGHTER Demo", src: "/module-assets/m4/videos/daughter.mov" },
  "m4-l5": { title: "GRANDFATHER Demo", src: "/module-assets/m4/videos/grandfather.mov" },
  "m4-l6": { title: "GRANDMOTHER Demo", src: "/module-assets/m4/videos/grandmother.mov" },
  "m4-l7": { title: "UNCLE Demo", src: "/module-assets/m4/videos/uncle.mov" },
  "m4-l8": { title: "AUNTIE Demo", src: "/module-assets/m4/videos/auntie.mov" },
  "m4-l9": { title: "COUSIN Demo", src: "/module-assets/m4/videos/cousin.mov" },
  "m4-l10": { title: "PARENTS Demo", src: "/module-assets/m4/videos/parents.mov" }
};

const MODULE5_LESSON_VIDEOS: Record<string, { title: string; src: string }> = {
  "m5-l1": { title: "BOY Demo", src: "/module-assets/m5/videos/boy.mov" },
  "m5-l2": { title: "GIRL Demo", src: "/module-assets/m5/videos/girl.mov" },
  "m5-l3": { title: "MAN Demo", src: "/module-assets/m5/videos/man.mov" },
  "m5-l4": { title: "WOMAN Demo", src: "/module-assets/m5/videos/woman.mov" },
  "m5-l5": { title: "DEAF Demo", src: "/module-assets/m5/videos/deaf.mov" },
  "m5-l6": { title: "HARD OF HEARING Demo", src: "/module-assets/m5/videos/hard-of-hearing.mov" },
  "m5-l7": { title: "WEELCHAIR PERSON Demo", src: "/module-assets/m5/videos/wheelchair-person.mov" },
  "m5-l8": { title: "BLIND Demo", src: "/module-assets/m5/videos/blind.mov" },
  "m5-l9": { title: "DEAF BLIND Demo", src: "/module-assets/m5/videos/deaf-blind.mov" },
  "m5-l10": { title: "MARRIED Demo", src: "/module-assets/m5/videos/married.mov" }
};

const MODULE6_LESSON_VIDEOS: Record<string, { title: string; src: string }> = {
  "m6-l1": { title: "MONDAY Demo", src: "/module-assets/m6/videos/monday.mov" },
  "m6-l2": { title: "TUESDAY Demo", src: "/module-assets/m6/videos/tuesday.mov" },
  "m6-l3": { title: "WEDNESDAY Demo", src: "/module-assets/m6/videos/wednesday.mov" },
  "m6-l4": { title: "THURSDAY Demo", src: "/module-assets/m6/videos/thursday.mov" },
  "m6-l5": { title: "FRIDAY Demo", src: "/module-assets/m6/videos/friday.mov" },
  "m6-l6": { title: "SATURDAY Demo", src: "/module-assets/m6/videos/saturday.mov" },
  "m6-l7": { title: "SUNDAY Demo", src: "/module-assets/m6/videos/sunday.mov" },
  "m6-l8": { title: "TODAY Demo", src: "/module-assets/m6/videos/today.mov" },
  "m6-l9": { title: "TOMORROW Demo", src: "/module-assets/m6/videos/tomorrow.mov" },
  "m6-l10": { title: "YESTERDAY Demo", src: "/module-assets/m6/videos/yesterday.mov" }
};

const MODULE7_LESSON_VIDEOS: Record<string, { title: string; src: string }> = {
  "m7-l1": { title: "BLUE Demo", src: "/module-assets/m7/videos/blue.mov" },
  "m7-l2": { title: "GREEN Demo", src: "/module-assets/m7/videos/green.mov" },
  "m7-l3": { title: "RED Demo", src: "/module-assets/m7/videos/red.mov" },
  "m7-l4": { title: "BROWN Demo", src: "/module-assets/m7/videos/brown.mov" },
  "m7-l5": { title: "BLACK Demo", src: "/module-assets/m7/videos/black.mov" },
  "m7-l6": { title: "WHITE Demo", src: "/module-assets/m7/videos/white.mov" },
  "m7-l7": { title: "YELLOW Demo", src: "/module-assets/m7/videos/yellow.mov" },
  "m7-l8": { title: "ORANGE Demo", src: "/module-assets/m7/videos/orange.mov" },
  "m7-l9": { title: "GRAY Demo", src: "/module-assets/m7/videos/gray.mov" },
  "m7-l10": { title: "PINK Demo", src: "/module-assets/m7/videos/pink.mov" },
  "m7-l11": { title: "VIOLET Demo", src: "/module-assets/m7/videos/violet.mov" },
  "m7-l12": { title: "LIGHT Demo", src: "/module-assets/m7/videos/light.mov" },
  "m7-l13": { title: "DARK Demo", src: "/module-assets/m7/videos/dark.mov" }
};

const MODULE8_LESSON_VIDEOS: Record<string, { title: string; src: string }> = {
  "m8-l1": { title: "UNDERSTAND Demo", src: "/module-assets/m8/videos/understand.mov" },
  "m8-l2": { title: "DON'T UNDERSTAND Demo", src: "/module-assets/m8/videos/dont-understand.mov" },
  "m8-l3": { title: "KNOW Demo", src: "/module-assets/m8/videos/know.mov" },
  "m8-l4": { title: "DON'T KNOW Demo", src: "/module-assets/m8/videos/dont-know.mov" },
  "m8-l5": { title: "NO Demo", src: "/module-assets/m8/videos/no.mov" },
  "m8-l6": { title: "YES Demo", src: "/module-assets/m8/videos/yes.mov" },
  "m8-l7": { title: "WRONG Demo", src: "/module-assets/m8/videos/wrong.mov" },
  "m8-l8": { title: "CORRECT Demo", src: "/module-assets/m8/videos/correct.mov" },
  "m8-l9": { title: "SLOW Demo", src: "/module-assets/m8/videos/slow.mov" },
  "m8-l10": { title: "FAST Demo", src: "/module-assets/m8/videos/fast.mov" }
};

const LESSON_VIDEO_MAP: Record<string, { title: string; src: string }> = {
  ...MODULE2_LESSON_VIDEOS,
  ...MODULE3_LESSON_VIDEOS,
  ...MODULE4_LESSON_VIDEOS,
  ...MODULE5_LESSON_VIDEOS,
  ...MODULE6_LESSON_VIDEOS,
  ...MODULE7_LESSON_VIDEOS,
  ...MODULE8_LESSON_VIDEOS
};

const MODULE1_ASSESSMENT_OPTIONS = [
  {
    id: "m1-assessment-1",
    title: "Assessment 1",
    subtitle: "Full Module A-Z Multiple Choice"
  },
  {
    id: "m1-assessment-2",
    title: "Assessment 2",
    subtitle: "Label the Hand Sign (A-Z)"
  },
  {
    id: "m1-assessment-3",
    title: "Assessment 3",
    subtitle: "Full Module Camera Challenge"
  }
] as const;

const MODULE1_ASSESSMENT2_IMAGE_ORDER = [
  "M",
  "B",
  "T",
  "A",
  "R",
  "H",
  "Z",
  "D",
  "Q",
  "L",
  "F",
  "Y",
  "C",
  "N",
  "I",
  "W",
  "E",
  "U",
  "K",
  "P",
  "G",
  "S",
  "X",
  "J",
  "O",
  "V"
] as const;

const MODULE1_LABELING_ITEMS = MODULE1_ASSESSMENT2_IMAGE_ORDER.map((letter) => ({
  id: `m1-label-${letter.toLowerCase()}`,
  answer: letter,
  src: `/module-assets/m1/assessment2/${letter.toLowerCase()}.png`
}));

const MODULE1_SIGNING_CHALLENGE_ITEMS = [
  "CHURCH",
  "MALL",
  "ZOO",
  "PARK",
  "ALLYSSA",
  "AARON",
  "PRINCESS",
  "JOHN",
  "BOX",
  "SCHOOL",
  "TREE",
  "CHAIR",
  "FLOWER",
  "CAT",
  "DOG",
  "RABBIT",
  "SHARK"
] as const;

const MODULE1_SIGNING_CHALLENGE_STEPS = MODULE1_SIGNING_CHALLENGE_ITEMS.map((item, index) => ({
  id: `m1-step-${index + 1}`,
  title: `Task ${index + 1}`,
  prompt: `Sign this word/name: ${item}`,
  imageSrc: null
}));

const MODULE2_ASSESSMENT_OPTIONS = [
  {
    id: "m2-assessment-1",
    title: "Assessment 1",
    subtitle: "Multiple Choice (5 items)"
  },
  {
    id: "m2-assessment-2",
    title: "Assessment 2",
    subtitle: "Camera: Sign 1-10"
  },
  {
    id: "m2-assessment-3",
    title: "Assessment 3",
    subtitle: "Camera: Sign 11-20 (at least 5)"
  },
  {
    id: "m2-assessment-4",
    title: "Assessment 4",
    subtitle: "Camera: Sign 31-40 (at least 5)"
  },
  {
    id: "m2-assessment-5",
    title: "Assessment 5",
    subtitle: "Camera: Sign 91-100 (at least 5)"
  }
] as const;

const MODULE2_SIGN_1_TO_10_STEPS = [
  { id: "m2-a2-1", number: 1 },
  { id: "m2-a2-2", number: 2 },
  { id: "m2-a2-3", number: 3 },
  { id: "m2-a2-4", number: 4 },
  { id: "m2-a2-5", number: 5 },
  { id: "m2-a2-6", number: 6 },
  { id: "m2-a2-7", number: 7 },
  { id: "m2-a2-8", number: 8 },
  { id: "m2-a2-9", number: 9 },
  { id: "m2-a2-10", number: 10 }
] as const;

const MODULE2_SIGN_11_TO_20_STEPS = [
  { id: "m2-a3-11", number: 11 },
  { id: "m2-a3-12", number: 12 },
  { id: "m2-a3-13", number: 13 },
  { id: "m2-a3-14", number: 14 },
  { id: "m2-a3-15", number: 15 },
  { id: "m2-a3-16", number: 16 },
  { id: "m2-a3-17", number: 17 },
  { id: "m2-a3-18", number: 18 },
  { id: "m2-a3-19", number: 19 },
  { id: "m2-a3-20", number: 20 }
] as const;

const MODULE2_SIGN_31_TO_40_STEPS = [
  { id: "m2-a4-31", number: 31 },
  { id: "m2-a4-32", number: 32 },
  { id: "m2-a4-33", number: 33 },
  { id: "m2-a4-34", number: 34 },
  { id: "m2-a4-35", number: 35 },
  { id: "m2-a4-36", number: 36 },
  { id: "m2-a4-37", number: 37 },
  { id: "m2-a4-38", number: 38 },
  { id: "m2-a4-39", number: 39 },
  { id: "m2-a4-40", number: 40 }
] as const;

const MODULE2_SIGN_91_TO_100_STEPS = [
  { id: "m2-a5-91", number: 91 },
  { id: "m2-a5-92", number: 92 },
  { id: "m2-a5-93", number: 93 },
  { id: "m2-a5-94", number: 94 },
  { id: "m2-a5-95", number: 95 },
  { id: "m2-a5-96", number: 96 },
  { id: "m2-a5-97", number: 97 },
  { id: "m2-a5-98", number: 98 },
  { id: "m2-a5-99", number: 99 },
  { id: "m2-a5-100", number: 100 }
] as const;

const MODULE3_ASSESSMENT_OPTIONS = [
  {
    id: "m3-assessment-1",
    title: "Assessment 1",
    subtitle: "Multiple Choice (5 items)"
  },
  {
    id: "m3-assessment-2",
    title: "Assessment 2",
    subtitle: "Camera: Sign at least 7 gestures"
  }
] as const;

const MODULE3_GESTURE_TARGETS = [
  { id: "m3-g1", label: "GOOD MORNING" },
  { id: "m3-g2", label: "GOOD AFTERNOON" },
  { id: "m3-g3", label: "GOOD EVENING" },
  { id: "m3-g4", label: "HELLO" },
  { id: "m3-g5", label: "HOW ARE YOU" },
  { id: "m3-g6", label: "I'M FINE" },
  { id: "m3-g7", label: "NICE TO MEET YOU" },
  { id: "m3-g8", label: "THANK YOU" },
  { id: "m3-g9", label: "YOU'RE WELCOME" },
  { id: "m3-g10", label: "SEE YOU TOMORROW" }
] as const;

const MODULE4_ASSESSMENT_OPTIONS = [
  {
    id: "m4-assessment-1",
    title: "Assessment 1",
    subtitle: "Multiple Choice (5 items)"
  },
  {
    id: "m4-assessment-2",
    title: "Assessment 2",
    subtitle: "Camera: Sign at least 7 gestures"
  }
] as const;

const MODULE4_GESTURE_TARGETS = [
  { id: "m4-g1", label: "FATHER" },
  { id: "m4-g2", label: "MOTHER" },
  { id: "m4-g3", label: "SON" },
  { id: "m4-g4", label: "DAUGHTER" },
  { id: "m4-g5", label: "GRANDFATHER" },
  { id: "m4-g6", label: "GRANDMOTHER" },
  { id: "m4-g7", label: "UNCLE" },
  { id: "m4-g8", label: "AUNTIE" },
  { id: "m4-g9", label: "COUSIN" },
  { id: "m4-g10", label: "PARENTS" }
] as const;

const MODULE5_ASSESSMENT_OPTIONS = [
  {
    id: "m5-assessment-1",
    title: "Assessment 1",
    subtitle: "Multiple Choice (5 items)"
  },
  {
    id: "m5-assessment-2",
    title: "Assessment 2",
    subtitle: "Camera: Sign at least 7 gestures"
  }
] as const;

const MODULE5_GESTURE_TARGETS = [
  { id: "m5-g1", label: "BOY" },
  { id: "m5-g2", label: "GIRL" },
  { id: "m5-g3", label: "MAN" },
  { id: "m5-g4", label: "WOMAN" },
  { id: "m5-g5", label: "DEAF" },
  { id: "m5-g6", label: "HARD OF HEARING" },
  { id: "m5-g7", label: "WEELCHAIR PERSON" },
  { id: "m5-g8", label: "BLIND" },
  { id: "m5-g9", label: "DEAF BLIND" },
  { id: "m5-g10", label: "MARRIED" }
] as const;

const MODULE6_ASSESSMENT_OPTIONS = [
  {
    id: "m6-assessment-1",
    title: "Assessment 1",
    subtitle: "Multiple Choice (5 items)"
  },
  {
    id: "m6-assessment-2",
    title: "Assessment 2",
    subtitle: "Camera: Sign at least 7 gestures"
  }
] as const;

const MODULE6_GESTURE_TARGETS = [
  { id: "m6-g1", label: "MONDAY" },
  { id: "m6-g2", label: "TUESDAY" },
  { id: "m6-g3", label: "WEDNESDAY" },
  { id: "m6-g4", label: "THURSDAY" },
  { id: "m6-g5", label: "FRIDAY" },
  { id: "m6-g6", label: "SATURDAY" },
  { id: "m6-g7", label: "SUNDAY" },
  { id: "m6-g8", label: "TODAY" },
  { id: "m6-g9", label: "TOMORROW" },
  { id: "m6-g10", label: "YESTERDAY" }
] as const;

const MODULE7_ASSESSMENT_OPTIONS = [
  {
    id: "m7-assessment-1",
    title: "Assessment 1",
    subtitle: "Multiple Choice (5 items)"
  },
  {
    id: "m7-assessment-2",
    title: "Assessment 2",
    subtitle: "Camera: Sign displayed colors"
  },
  {
    id: "m7-assessment-3",
    title: "Assessment 3",
    subtitle: "Camera: Sign at least 7 gestures"
  }
] as const;

const MODULE7_COLOR_SIGN_TARGETS = [
  { id: "m7-c1", label: "BLUE", colorHex: "#2563eb" },
  { id: "m7-c2", label: "RED", colorHex: "#dc2626" },
  { id: "m7-c3", label: "GREEN", colorHex: "#16a34a" },
  { id: "m7-c4", label: "BROWN", colorHex: "#8b5e34" },
  { id: "m7-c5", label: "BLACK", colorHex: "#111827" }
] as const;

const MODULE7_GESTURE_TARGETS = [
  { id: "m7-g1", label: "BLUE" },
  { id: "m7-g2", label: "GREEN" },
  { id: "m7-g3", label: "RED" },
  { id: "m7-g4", label: "BROWN" },
  { id: "m7-g5", label: "BLACK" },
  { id: "m7-g6", label: "WHITE" },
  { id: "m7-g7", label: "YELLOW" },
  { id: "m7-g8", label: "ORANGE" },
  { id: "m7-g9", label: "GRAY" },
  { id: "m7-g10", label: "PINK" },
  { id: "m7-g11", label: "VIOLET" },
  { id: "m7-g12", label: "LIGHT" },
  { id: "m7-g13", label: "DARK" }
] as const;

const MODULE8_ASSESSMENT_OPTIONS = [
  {
    id: "m8-assessment-1",
    title: "Assessment 1",
    subtitle: "Multiple Choice (5 items)"
  },
  {
    id: "m8-assessment-2",
    title: "Assessment 2",
    subtitle: "Camera: Sign at least 7 gestures"
  }
] as const;

const CUSTOM_ASSESSMENT_IDS_BY_SLUG: Record<string, readonly string[]> = {
  "fsl-alphabets": MODULE1_ASSESSMENT_OPTIONS.map((item) => item.id),
  numbers: MODULE2_ASSESSMENT_OPTIONS.map((item) => item.id),
  "common-words": MODULE3_ASSESSMENT_OPTIONS.map((item) => item.id),
  "family-members": MODULE4_ASSESSMENT_OPTIONS.map((item) => item.id),
  "people-description": MODULE5_ASSESSMENT_OPTIONS.map((item) => item.id),
  days: MODULE6_ASSESSMENT_OPTIONS.map((item) => item.id),
  "colors-descriptions": MODULE7_ASSESSMENT_OPTIONS.map((item) => item.id),
  "basic-conversations": MODULE8_ASSESSMENT_OPTIONS.map((item) => item.id),
};

function getAvailableAssessmentIds(module: ModuleItem): string[] {
  const customIds = CUSTOM_ASSESSMENT_IDS_BY_SLUG[module.slug];
  if (customIds && customIds.length > 0) {
    return [...customIds];
  }
  return module.assessments.map((assessment) => assessment.id);
}

const MODULE8_GESTURE_TARGETS = [
  { id: "m8-g1", label: "UNDERSTAND" },
  { id: "m8-g2", label: "DON'T UNDERSTAND" },
  { id: "m8-g3", label: "KNOW" },
  { id: "m8-g4", label: "DON'T KNOW" },
  { id: "m8-g5", label: "NO" },
  { id: "m8-g6", label: "YES" },
  { id: "m8-g7", label: "WRONG" },
  { id: "m8-g8", label: "CORRECT" },
  { id: "m8-g9", label: "SLOW" },
  { id: "m8-g10", label: "FAST" }
] as const;

function isValidPredictionToken(value: string) {
  const token = value.trim();
  return token.length > 0 && token !== "No prediction yet." && token !== "UNSURE";
}

async function captureVideoFrameAsFile(video: HTMLVideoElement | null): Promise<File | null> {
  if (!video) {
    return null;
  }

  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, sourceWidth, sourceHeight);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92);
  });
  if (!blob) {
    return null;
  }

  return new File([blob], "assessment-frame.jpg", { type: "image/jpeg" });
}

function SignCardImage({ letter, src }: { letter: string; src: string }) {
  const [available, setAvailable] = useState(true);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {available ? (
        <img
          alt={`Letter ${letter} hand sign`}
          className="h-56 w-full bg-[#2f6a16] object-cover object-center"
          loading="lazy"
          onError={() => setAvailable(false)}
          src={src}
        />
      ) : (
        <div className="flex h-56 items-center justify-center bg-[#2f6a16]/15 px-4 text-center text-sm font-semibold text-slate-600">
          Add cropped image for letter {letter}
        </div>
      )}
      <div className="border-t border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700">
        Letter {letter}
      </div>
    </article>
  );
}

function MotionVideoCard({ src, letter }: { src: string; letter: string }) {
  const [available, setAvailable] = useState(true);

  if (!available) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-slate-200 bg-brandBlueLight px-4 text-center text-sm font-semibold text-slate-600">
        Add `{letter.toLowerCase()}.mp4` to show the {letter} motion demo.
      </div>
    );
  }

  return (
    <video
      className="h-72 w-full rounded-xl border border-slate-200 bg-slate-900 object-cover"
      controls
      loop
      muted
      onError={() => setAvailable(false)}
      playsInline
      preload="metadata"
      src={src}
    />
  );
}

function LessonVideoCard({ src, title }: { src: string; title: string }) {
  const [available, setAvailable] = useState(true);

  if (!available) {
    return (
      <div className="mt-5 rounded-xl border border-slate-200 bg-brandBlueLight p-4 text-sm font-semibold text-slate-700">
        Missing video file for: {title}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <video
        className="mt-2 h-72 w-full rounded-xl border border-slate-200 bg-slate-900 object-contain"
        controls
        loop
        muted
        onError={() => setAvailable(false)}
        playsInline
        preload="metadata"
        src={src}
      />
    </div>
  );
}

function ReadOnlyAssessmentShell({
  title,
  subtitle,
  notice,
  children,
}: {
  title: string;
  subtitle?: string;
  notice: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="rounded-xl border border-brandBlue/20 bg-brandBlueLight px-4 py-3 text-sm text-slate-700">
        {notice}
      </div>
      <div>
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-2 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function MultipleChoicePreview({
  notice,
  questions,
  subtitle,
  title,
}: {
  notice: string;
  questions: Array<{ id: string; question: string; choices: string[] }>;
  subtitle?: string;
  title: string;
}) {
  return (
    <ReadOnlyAssessmentShell notice={notice} subtitle={subtitle} title={title}>
      {questions.length ? (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={question.id}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brandBlue">
                Question {index + 1}
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900">{question.question}</p>
              <ul className="mt-3 space-y-2">
                {question.choices.map((choice) => (
                  <li
                    className="rounded-lg border border-brandBlue/20 bg-white px-3 py-2 text-sm text-slate-700"
                    key={choice}
                  >
                    {choice}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          No question set is available for this assessment preview yet.
        </div>
      )}
    </ReadOnlyAssessmentShell>
  );
}

function Module1AssessmentOne({
  questions,
  onSubmitResult
}: {
  questions: Array<{ id: string; question: string; choices: string[]; answer: string }>;
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  const [selectedChoices, setSelectedChoices] = useSessionState<Record<string, string>>(
    "module-detail:m1-assessment-1:selectedChoices",
    {}
  );
  const [showResult, setShowResult] = useSessionState<boolean>(
    "module-detail:m1-assessment-1:showResult",
    false
  );
  const [reported, setReported] = useSessionState<boolean>(
    "module-detail:m1-assessment-1:reported",
    false
  );

  const answeredCount = questions.filter((question) => selectedChoices[question.id]).length;
  const score = questions.reduce((total, question) => {
    const picked = selectedChoices[question.id];
    if (!picked) {
      return total;
    }
    return total + (picked === question.answer ? 1 : 0);
  }, 0);

  async function submitAssessmentResult() {
    if (reported) {
      return;
    }
    const total = questions.length;
    const right = score;
    const wrong = Math.max(0, total - right);
    const improvementAreas = questions
      .filter((question) => selectedChoices[question.id] !== question.answer)
      .map((question) => question.question);
    const didPersist = await persistAssessmentResult(onSubmitResult, {
      assessmentId: "m1-assessment-1",
      assessmentTitle: "Assessment 1",
      right,
      wrong,
      total,
      scorePercent: total > 0 ? Math.round((right / total) * 100) : 0,
      improvementAreas,
      source: "student_module",
      items: questions.map((question) => {
        const studentAnswer = selectedChoices[question.id] ?? null;
        return {
          itemKey: question.id,
          prompt: question.question,
          expectedAnswer: question.answer,
          studentAnswer,
          isCorrect: studentAnswer === question.answer,
        };
      }),
    });
    if (didPersist) {
      setReported(true);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xl font-semibold text-slate-900">Assessment 1</h3>
      <p className="mt-2 text-sm text-slate-600">
        Answer all five multiple-choice questions covering the full Module 1 alphabet lessons (A-Z).
      </p>

      <div className="mt-4 space-y-4">
        {questions.map((question, index) => (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={question.id}>
            <p className="text-sm font-semibold text-slate-900">
              {index + 1}. {question.question}
            </p>
            <div className="mt-3 space-y-2">
              {question.choices.map((choice) => {
                const checked = selectedChoices[question.id] === choice;
                return (
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-brandBlue bg-brandBlueLight text-slate-900"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    key={choice}
                  >
                    <input
                      checked={checked}
                      className="h-4 w-4 accent-brandBlue"
                      name={question.id}
                      onChange={() =>
                        setSelectedChoices((previous) => ({
                          ...previous,
                          [question.id]: choice
                        }))
                      }
                      type="radio"
                    />
                    {choice}
                  </label>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
          onClick={() => {
            setShowResult(true);
            void submitAssessmentResult();
          }}
          type="button"
        >
          Check Answers
        </button>
        <span className="text-xs text-slate-500">
          Answered {answeredCount}/{questions.length}
        </span>
      </div>

      {showResult ? (
        <p className="mt-3 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
          Score: {score}/{questions.length}
        </p>
      ) : null}
    </div>
  );
}

function Module1AssessmentTwo({
  onSubmitResult
}: {
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  const [answers, setAnswers] = useSessionState<Record<string, string>>(
    "module-detail:m1-assessment-2:answers",
    {}
  );
  const [showResult, setShowResult] = useSessionState<boolean>(
    "module-detail:m1-assessment-2:showResult",
    false
  );
  const [reported, setReported] = useSessionState<boolean>(
    "module-detail:m1-assessment-2:reported",
    false
  );

  const correctCount = MODULE1_LABELING_ITEMS.reduce((total, item) => {
    const value = answers[item.id]?.trim().toUpperCase() ?? "";
    return total + (value === item.answer ? 1 : 0);
  }, 0);

  async function submitAssessmentResult() {
    if (reported) {
      return;
    }
    const total = MODULE1_LABELING_ITEMS.length;
    const right = correctCount;
    const wrong = Math.max(0, total - right);
    const improvementAreas = MODULE1_LABELING_ITEMS.filter((item) => {
      const value = answers[item.id]?.trim().toUpperCase() ?? "";
      return value !== item.answer;
    }).map((item) => `Hand sign item ${item.answer}`);
    const didPersist = await persistAssessmentResult(onSubmitResult, {
      assessmentId: "m1-assessment-2",
      assessmentTitle: "Assessment 2",
      right,
      wrong,
      total,
      scorePercent: total > 0 ? Math.round((right / total) * 100) : 0,
      improvementAreas,
      source: "student_module",
      items: MODULE1_LABELING_ITEMS.map((item) => {
        const studentAnswer = answers[item.id]?.trim().toUpperCase() ?? "";
        return {
          itemKey: item.id,
          prompt: `Identify the hand sign for ${item.answer}`,
          expectedAnswer: item.answer,
          studentAnswer: studentAnswer || null,
          isCorrect: studentAnswer === item.answer,
        };
      }),
    });
    if (didPersist) {
      setReported(true);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xl font-semibold text-slate-900">Assessment 2</h3>
      <p className="mt-2 text-sm text-slate-600">
        Look at each hand sign image and type the correct alphabet letter. Images are mixed to cover the whole module.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODULE1_LABELING_ITEMS.map((item) => (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={item.id}>
            <img
              alt="Alphabet hand sign"
              className="h-44 w-full rounded-lg border border-slate-200 bg-[#2f6a16] object-cover object-center"
              loading="lazy"
              src={item.src}
            />
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor={item.id}>
              Your answer
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              id={item.id}
              maxLength={1}
              onChange={(event) =>
                setAnswers((previous) => ({
                  ...previous,
                  [item.id]: event.target.value
                }))
              }
              placeholder="Type letter"
              type="text"
              value={answers[item.id] ?? ""}
            />
            {showResult ? (
              <p className="mt-2 text-xs font-semibold text-slate-700">
                {answers[item.id]?.trim().toUpperCase() === item.answer ? "Correct" : `Correct answer: ${item.answer}`}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
          onClick={() => {
            setShowResult(true);
            void submitAssessmentResult();
          }}
          type="button"
        >
          Check Answers
        </button>
        {showResult ? (
          <span className="rounded-lg border border-brandGreen/30 bg-brandGreen/10 px-3 py-1 text-sm font-semibold text-slate-800">
            Score: {correctCount}/{MODULE1_LABELING_ITEMS.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Module1AssessmentThree({
  onSubmitResult
}: {
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  const ALPHABET_PALM_COOLDOWN_MS = 900;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const openPalmInFlightRef = useRef(false);
  const palmRaisedRef = useRef(false);
  const lastPalmCommitAtRef = useRef(0);
  const hiddenPredictionRef = useRef("No prediction yet.");
  const blockedTokenRef = useRef<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [recognizedTrail, setRecognizedTrail] = useState("");
  const [recognizedByStep, setRecognizedByStep] = useState<Record<string, string>>({});
  const [hiddenPrediction, setHiddenPrediction] = useState("No prediction yet.");
  const [predictionConfidence, setPredictionConfidence] = useState<number | null>(null);
  const [predictionTopCandidates, setPredictionTopCandidates] = useState<string[]>([]);
  const [lastRecognizedToken, setLastRecognizedToken] = useState<string | null>(null);
  const [blockedTokenAfterClear, setBlockedTokenAfterClear] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  const activeStep = MODULE1_SIGNING_CHALLENGE_STEPS[activeStepIndex];
  const allDone = completedStepIds.length >= MODULE1_SIGNING_CHALLENGE_STEPS.length;

  function currentDetectedGesture() {
    const recognized = (recognizedByStep[activeStep.id] ?? "").trim();
    if (recognized) {
      return recognized;
    }
    return "";
  }

  useEffect(() => {
    hiddenPredictionRef.current = hiddenPrediction;
  }, [hiddenPrediction]);

  useEffect(() => {
    blockedTokenRef.current = blockedTokenAfterClear;
  }, [blockedTokenAfterClear]);

  useEffect(() => {
    return () => {
      palmRaisedRef.current = false;
      lastPalmCommitAtRef.current = 0;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setRunning(true);
    } catch {
      setError("Unable to access camera. Check browser permission.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setRunning(false);
  }

  async function toggleCamera() {
    if (running) {
      stopCamera();
      return;
    }
    await startCamera();
  }

  async function runHiddenPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    predictionInFlightRef.current = true;
    try {
      const frame = await captureVideoFrameAsFile(videoRef.current);
      if (!frame) {
        return;
      }
      const result = await predictSignFromImage(frame, "alphabet");
      setHiddenPrediction(result.prediction);
      setPredictionConfidence(result.confidence);
      setPredictionTopCandidates(result.top_candidates);
    } catch {
      // Keep UI clean; hidden prediction should not block the assessment flow.
    } finally {
      predictionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!running) {
      setHiddenPrediction("No prediction yet.");
      setPredictionConfidence(null);
      setPredictionTopCandidates([]);
      return;
    }

    void runHiddenPrediction();
    const interval = window.setInterval(() => {
      void runHiddenPrediction();
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [running]);

  useEffect(() => {
    const token = hiddenPrediction.trim();
    if (!isValidPredictionToken(token)) {
      return;
    }
    if (blockedTokenAfterClear && token === blockedTokenAfterClear) {
      setHiddenPrediction("No prediction yet.");
      return;
    }
    if (blockedTokenAfterClear && token !== blockedTokenAfterClear) {
      setBlockedTokenAfterClear(null);
    }
  }, [hiddenPrediction, blockedTokenAfterClear]);

  useEffect(() => {
    if (!running) {
      palmRaisedRef.current = false;
      return;
    }

    let cancelled = false;

    async function checkOpenPalmSignal() {
      if (cancelled || openPalmInFlightRef.current) {
        return;
      }
      openPalmInFlightRef.current = true;
      try {
        const frame = await captureVideoFrameAsFile(videoRef.current);
        if (!frame) {
          return;
        }
        const result = await detectOpenPalmFromImage(frame);
        const openPalm = result.open_palm;
        const now = Date.now();

        if (
          openPalm &&
          !palmRaisedRef.current &&
          now - lastPalmCommitAtRef.current >= ALPHABET_PALM_COOLDOWN_MS
        ) {
          const token = hiddenPredictionRef.current.trim();
          const blockedToken = blockedTokenRef.current;
          if (
            isValidPredictionToken(token) &&
            (!blockedToken || blockedToken !== token)
          ) {
            const isRapidDuplicate =
              token === lastRecognizedToken &&
              now - lastPalmCommitAtRef.current < ALPHABET_PALM_COOLDOWN_MS;
            if (!isRapidDuplicate) {
              setRecognizedByStep((previous) => ({
                ...previous,
                [activeStep.id]: token
              }));
              setRecognizedTrail((previous) => (previous ? `${previous} ${token}` : token));
              setLastRecognizedToken(token);
              lastPalmCommitAtRef.current = now;
            }
          }
        }

        palmRaisedRef.current = openPalm;
      } catch {
        // Keep silent to avoid noisy UI.
      } finally {
        openPalmInFlightRef.current = false;
      }
    }

    const interval = window.setInterval(() => {
      void checkOpenPalmSignal();
    }, 420);
    void checkOpenPalmSignal();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      palmRaisedRef.current = false;
    };
  }, [running, activeStep.id, lastRecognizedToken]);

  async function submitCurrentStep() {
    const value = currentDetectedGesture();
    if (!value) {
      setError("Please wait for a recognized gesture before continuing.");
      return;
    }

    setError(null);
    setCompletedStepIds((previous) =>
      previous.includes(activeStep.id) ? previous : [...previous, activeStep.id]
    );

    if (activeStepIndex < MODULE1_SIGNING_CHALLENGE_STEPS.length - 1) {
      setActiveStepIndex((index) =>
        Math.min(MODULE1_SIGNING_CHALLENGE_STEPS.length - 1, index + 1)
      );
      return;
    }

    if (!reported) {
      const total = MODULE1_SIGNING_CHALLENGE_STEPS.length;
      const right = completedStepIds.includes(activeStep.id)
        ? completedStepIds.length
        : completedStepIds.length + 1;
      const wrong = Math.max(0, total - right);
      const improvementAreas = MODULE1_SIGNING_CHALLENGE_STEPS.filter(
        (step) => !(step.id === activeStep.id || completedStepIds.includes(step.id))
      ).map((step) => step.prompt);
      const successfulStepIds = new Set([...completedStepIds, activeStep.id]);
      const didPersist = await persistAssessmentResult(onSubmitResult, {
        assessmentId: "m1-assessment-3",
        assessmentTitle: "Assessment 3",
        right,
        wrong,
        total,
        scorePercent: total > 0 ? Math.round((right / total) * 100) : 0,
        improvementAreas,
        source: "student_module_camera",
        items: MODULE1_SIGNING_CHALLENGE_STEPS.map((step) => {
          const studentAnswer = recognizedByStep[step.id]?.trim() ?? "";
          return {
            itemKey: step.id,
            prompt: step.prompt,
            expectedAnswer: step.prompt.replace("Sign this word/name: ", ""),
            studentAnswer: studentAnswer || null,
            isCorrect: successfulStepIds.has(step.id),
          };
        }),
      });
      if (didPersist) {
        setReported(true);
      }
    }
  }

  function clearCurrentInput() {
    const token = hiddenPrediction.trim();
    if (isValidPredictionToken(token)) {
      setBlockedTokenAfterClear(token);
    } else {
      setBlockedTokenAfterClear(null);
    }
    setRecognizedTrail("");
    setRecognizedByStep((previous) => ({
      ...previous,
      [activeStep.id]: ""
    }));
    palmRaisedRef.current = false;
    lastPalmCommitAtRef.current = 0;
    setHiddenPrediction("No prediction yet.");
    setPredictionConfidence(null);
    setPredictionTopCandidates([]);
    setLastRecognizedToken(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xl font-semibold text-slate-900">Assessment 3</h3>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <video
            autoPlay
            className="h-[300px] w-full rounded-xl border border-slate-300 bg-slate-900 object-cover md:h-[420px]"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={`rounded px-3 py-2 text-xs font-semibold text-white transition ${
                running ? "bg-brandRed hover:bg-brandRed/90" : "bg-brandBlue hover:bg-brandBlue/90"
              }`}
              onClick={() => {
                void toggleCamera();
              }}
              type="button"
            >
              <span className="inline-grid min-w-[92px] place-items-center">
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                  }`}
                >
                  Start Camera
                </span>
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                  }`}
                >
                  Stop Camera
                </span>
              </span>
            </button>
            <span className="rounded bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              {running ? "Alphabet mode active (show open palm to enter)" : "Camera off"}
            </span>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wider label-accent">Current Task</p>
          <h4 className="mt-1 text-base font-semibold text-slate-900">{activeStep.title}</h4>
          <p className="mt-2 text-sm text-slate-700">{activeStep.prompt}</p>

          {activeStep.imageSrc ? (
            <img
              alt={activeStep.title}
              className="mt-3 h-40 w-full rounded-lg border border-slate-200 bg-white object-contain p-2"
              src={activeStep.imageSrc}
            />
          ) : null}

          <div className="mt-3 rounded-lg border border-brandBorder bg-white p-3">
            <p className="text-xs uppercase tracking-wider label-accent">Prediction Output</p>
            <p className="mt-2 text-lg font-bold text-brandBlue">{hiddenPrediction}</p>
            <p className="mt-1 text-xs text-slate-700">
              Confidence:{" "}
              {predictionConfidence !== null ? `${Math.round(predictionConfidence * 100)}%` : "N/A"}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Top candidates:{" "}
              {predictionTopCandidates.length > 0 ? predictionTopCandidates.join(" | ") : "N/A"}
            </p>
            <p className="mt-2 rounded-md border border-brandYellow/35 bg-brandYellowLight px-2 py-1 text-xs font-semibold text-slate-800">
              Note: Show an open palm after the prediction appears to enter the letter.
            </p>
          </div>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider label-accent">
            Recognized Gesture
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              readOnly
              onDrop={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              placeholder="Recognized gesture/phrase appears here..."
              spellCheck={false}
              type="text"
              value={recognizedTrail}
            />
          </label>
          <button
            className="mt-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={clearCurrentInput}
            type="button"
          >
            Clear Input
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              disabled={activeStepIndex === 0}
              onClick={() => setActiveStepIndex((index) => Math.max(0, index - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              onClick={() => {
                void submitCurrentStep();
              }}
              type="button"
            >
              {activeStepIndex === MODULE1_SIGNING_CHALLENGE_STEPS.length - 1 ? "Submit" : "Next"}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Completed: {completedStepIds.length}/{MODULE1_SIGNING_CHALLENGE_STEPS.length}
          </p>

          {allDone ? (
            <p className="mt-2 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
              Assessment complete. All tasks submitted.
            </p>
          ) : null}

          <Link
            className="mt-3 inline-flex rounded border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/gesture-tester"
          >
            Open Gesture Tester
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Module2AssessmentOne({
  questions,
  moduleLabel,
  assessmentId,
  assessmentTitle = "Assessment 1",
  onSubmitResult
}: {
  questions: Array<{ id: string; question: string; choices: string[]; answer: string }>;
  moduleLabel: string;
  assessmentId: string;
  assessmentTitle?: string;
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  const [selectedChoices, setSelectedChoices] = useSessionState<Record<string, string>>(
    `module-detail:${assessmentId}:selectedChoices`,
    {}
  );
  const [showResult, setShowResult] = useSessionState<boolean>(
    `module-detail:${assessmentId}:showResult`,
    false
  );
  const [reported, setReported] = useSessionState<boolean>(
    `module-detail:${assessmentId}:reported`,
    false
  );

  const answeredCount = questions.filter((question) => selectedChoices[question.id]).length;
  const score = questions.reduce((total, question) => {
    const picked = selectedChoices[question.id];
    if (!picked) {
      return total;
    }
    return total + (picked === question.answer ? 1 : 0);
  }, 0);

  async function submitAssessmentResult() {
    if (reported) {
      return;
    }
    const total = questions.length;
    const right = score;
    const wrong = Math.max(0, total - right);
    const improvementAreas = questions
      .filter((question) => selectedChoices[question.id] !== question.answer)
      .map((question) => question.question);
    const didPersist = await persistAssessmentResult(onSubmitResult, {
      assessmentId,
      assessmentTitle,
      right,
      wrong,
      total,
      scorePercent: total > 0 ? Math.round((right / total) * 100) : 0,
      improvementAreas,
      source: "student_module",
      items: questions.map((question) => {
        const studentAnswer = selectedChoices[question.id] ?? null;
        return {
          itemKey: question.id,
          prompt: question.question,
          expectedAnswer: question.answer,
          studentAnswer,
          isCorrect: studentAnswer === question.answer,
        };
      }),
    });
    if (didPersist) {
      setReported(true);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xl font-semibold text-slate-900">Assessment 1</h3>
      <p className="mt-2 text-sm text-slate-600">
        Answer all five multiple-choice questions for the {moduleLabel} module.
      </p>

      <div className="mt-4 space-y-4">
        {questions.map((question, index) => (
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={question.id}>
            <p className="text-sm font-semibold text-slate-900">
              {index + 1}. {question.question}
            </p>
            <div className="mt-3 space-y-2">
              {question.choices.map((choice) => {
                const checked = selectedChoices[question.id] === choice;
                return (
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-brandBlue bg-brandBlueLight text-slate-900"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    key={choice}
                  >
                    <input
                      checked={checked}
                      className="h-4 w-4 accent-brandBlue"
                      name={question.id}
                      onChange={() =>
                        setSelectedChoices((previous) => ({
                          ...previous,
                          [question.id]: choice
                        }))
                      }
                      type="radio"
                    />
                    {choice}
                  </label>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
          onClick={() => {
            setShowResult(true);
            void submitAssessmentResult();
          }}
          type="button"
        >
          Check Answers
        </button>
        <span className="text-xs text-slate-500">
          Answered {answeredCount}/{questions.length}
        </span>
      </div>

      {showResult ? (
        <p className="mt-3 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
          Score: {score}/{questions.length}
        </p>
      ) : null}
    </div>
  );
}

function NumbersCameraAssessment({
  assessmentId,
  title,
  intro,
  targets,
  minimumRequired = targets.length,
  onSubmitResult
}: {
  assessmentId: string;
  title: string;
  intro: string;
  targets: readonly { id: string; number: number }[];
  minimumRequired?: number;
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [recognizedTrail, setRecognizedTrail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [recognizedByStep, setRecognizedByStep] = useState<Record<string, string>>({});
  const [hiddenPrediction, setHiddenPrediction] = useState("No prediction yet.");
  const [lastRecognizedToken, setLastRecognizedToken] = useState<string | null>(null);
  const [blockedTokenAfterClear, setBlockedTokenAfterClear] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  const activeStep = targets[activeStepIndex];
  const reachedMinimum = completedStepIds.length >= minimumRequired;
  const allDone = completedStepIds.length >= targets.length;
  const currentDetectedGesture = (recognizedByStep[activeStep.id] ?? "").trim();

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setRunning(true);
    } catch {
      setError("Unable to access camera. Check browser permission.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setRunning(false);
  }

  async function toggleCamera() {
    if (running) {
      stopCamera();
      return;
    }
    await startCamera();
  }

  async function runHiddenPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    predictionInFlightRef.current = true;
    try {
      const frame = await captureVideoFrameAsFile(videoRef.current);
      if (!frame) {
        return;
      }
      const result = await predictSignFromImage(frame, "numbers");
      setHiddenPrediction(result.prediction);
    } catch {
      // Hidden prediction failures should not break the flow.
    } finally {
      predictionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    const token = hiddenPrediction.trim();
    if (!isValidPredictionToken(token)) {
      return;
    }
    if (blockedTokenAfterClear && token === blockedTokenAfterClear) {
      setHiddenPrediction("No prediction yet.");
      return;
    }
    if (blockedTokenAfterClear && token !== blockedTokenAfterClear) {
      setBlockedTokenAfterClear(null);
    }
    if (token === lastRecognizedToken) {
      setHiddenPrediction("No prediction yet.");
      return;
    }

    setRecognizedByStep((previous) => ({
      ...previous,
      [activeStep.id]: token
    }));
    setRecognizedTrail((previous) => (previous ? `${previous} ${token}` : token));
    setLastRecognizedToken(token);
    setHiddenPrediction("No prediction yet.");
  }, [hiddenPrediction, blockedTokenAfterClear, lastRecognizedToken, activeStep.id]);

  function submitCurrentStep() {
    const value = currentDetectedGesture.trim();
    if (!value) {
      setError("Please wait for a recognized gesture before continuing.");
      return;
    }

    setError(null);
    setCompletedStepIds((previous) =>
      previous.includes(activeStep.id) ? previous : [...previous, activeStep.id]
    );

    if (activeStepIndex < targets.length - 1) {
      setActiveStepIndex((index) => Math.min(targets.length - 1, index + 1));
    }
  }

  async function finishAssessment() {
    if (!reachedMinimum) {
      setError(`Please complete at least ${minimumRequired} number signs before submitting.`);
      return;
    }
    setError(null);
    setSubmitted(true);
    if (!reported) {
      const total = targets.length;
      const right = completedStepIds.length;
      const wrong = Math.max(0, total - right);
      const improvementAreas = targets
        .filter((step) => !completedStepIds.includes(step.id))
        .map((step) => `Practice number ${step.number}`);
      const didPersist = await persistAssessmentResult(onSubmitResult, {
        assessmentId,
        assessmentTitle: title,
        right,
        wrong,
        total,
        scorePercent: total > 0 ? Math.round((right / total) * 100) : 0,
        improvementAreas,
        source: "student_module_camera",
        items: targets.map((step) => {
          const studentAnswer = recognizedByStep[step.id]?.trim() ?? "";
          return {
            itemKey: step.id,
            prompt: `Sign number ${step.number}`,
            expectedAnswer: String(step.number),
            studentAnswer: studentAnswer || null,
            isCorrect: completedStepIds.includes(step.id),
          };
        }),
      });
      if (didPersist) {
        setReported(true);
      }
    }
  }

  function clearCurrentInput() {
    const token = hiddenPrediction.trim();
    if (isValidPredictionToken(token)) {
      setBlockedTokenAfterClear(token);
    } else {
      setBlockedTokenAfterClear(null);
    }
    setRecognizedTrail("");
    setRecognizedByStep((previous) => ({
      ...previous,
      [activeStep.id]: ""
    }));
    setHiddenPrediction("No prediction yet.");
    setLastRecognizedToken(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      <p className="sr-only">{intro}</p>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <video
            autoPlay
            className="h-[300px] w-full rounded-xl border border-slate-300 bg-slate-900 object-cover md:h-[420px]"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={`rounded px-3 py-2 text-xs font-semibold text-white transition ${
                running ? "bg-brandRed hover:bg-brandRed/90" : "bg-brandBlue hover:bg-brandBlue/90"
              }`}
              onClick={() => {
                void toggleCamera();
              }}
              type="button"
            >
              <span className="inline-grid min-w-[92px] place-items-center">
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                  }`}
                >
                  Start Camera
                </span>
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                  }`}
                >
                  Stop Camera
                </span>
              </span>
            </button>
            <button
              className="rounded bg-brandRed px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!running}
              onClick={() => {
                void runHiddenPrediction();
              }}
              type="button"
            >
              Analyze Sign Now
            </button>
            <span className="rounded bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              {running ? "Camera active" : "Camera off"}
            </span>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wider label-accent">Current Number</p>
          <div className="mt-2 flex items-center justify-center rounded-xl border border-brandBlue/20 bg-brandBlueLight p-6">
            <span className="text-5xl font-bold text-brandBlue">{activeStep.number}</span>
          </div>
          <p className="mt-3 text-sm text-slate-700">
            Sign the number shown above. The recognized output appears automatically below.
          </p>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider label-accent">
            Recognized Gesture
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              readOnly
              onDrop={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              placeholder="Recognized gesture/phrase appears here..."
              spellCheck={false}
              type="text"
              value={recognizedTrail}
            />
          </label>
          <button
            className="mt-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={clearCurrentInput}
            type="button"
          >
            Clear Input
          </button>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              disabled={activeStepIndex === 0}
              onClick={() => setActiveStepIndex((index) => Math.max(0, index - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              onClick={submitCurrentStep}
              type="button"
            >
              {activeStepIndex === targets.length - 1 ? "Mark Done" : "Next"}
            </button>
            {reachedMinimum ? (
              <button
                className="rounded border border-brandBlue bg-white px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                onClick={() => {
                  void finishAssessment();
                }}
                type="button"
              >
                Finish
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Completed: {completedStepIds.length}/{targets.length}
          </p>
          {minimumRequired < targets.length ? (
            <p className="mt-1 text-xs text-slate-600">Minimum required: {minimumRequired}</p>
          ) : null}

          {submitted || allDone ? (
            <p className="mt-2 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
              Assessment complete. All number tasks submitted.
            </p>
          ) : null}

          <Link
            className="mt-3 inline-flex rounded border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/gesture-tester"
          >
            Open Gesture Tester
          </Link>
        </aside>
      </div>
    </div>
  );
}

function GestureCameraAssessment({
  assessmentId,
  title,
  intro,
  targets,
  minimumRequired,
  onSubmitResult
}: {
  assessmentId: string;
  title: string;
  intro: string;
  targets: readonly { id: string; label: string }[];
  minimumRequired: number;
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [recognizedTrail, setRecognizedTrail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [recognizedByStep, setRecognizedByStep] = useState<Record<string, string>>({});
  const [hiddenPrediction, setHiddenPrediction] = useState("No prediction yet.");
  const [lastRecognizedToken, setLastRecognizedToken] = useState<string | null>(null);
  const [blockedTokenAfterClear, setBlockedTokenAfterClear] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const activeStep = targets[activeStepIndex];
  const reachedMinimum = completedStepIds.length >= minimumRequired;
  const allDone = completedStepIds.length >= targets.length;
  const currentDetectedGesture = (recognizedByStep[activeStep.id] ?? "").trim();

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setRunning(true);
    } catch {
      setError("Unable to access camera. Check browser permission.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setRunning(false);
  }

  async function toggleCamera() {
    if (running) {
      stopCamera();
      return;
    }
    await startCamera();
  }

  async function runHiddenPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    predictionInFlightRef.current = true;
    try {
      const frame = await captureVideoFrameAsFile(videoRef.current);
      if (!frame) {
        return;
      }
      const result = await predictSignFromImage(frame, "words");
      setHiddenPrediction(result.prediction);
    } catch {
      // Hidden prediction failures should not break the assessment flow.
    } finally {
      predictionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    const token = hiddenPrediction.trim();
    if (!isValidPredictionToken(token)) {
      return;
    }
    if (blockedTokenAfterClear && token === blockedTokenAfterClear) {
      setHiddenPrediction("No prediction yet.");
      return;
    }
    if (blockedTokenAfterClear && token !== blockedTokenAfterClear) {
      setBlockedTokenAfterClear(null);
    }
    if (token === lastRecognizedToken) {
      setHiddenPrediction("No prediction yet.");
      return;
    }

    setRecognizedByStep((previous) => ({
      ...previous,
      [activeStep.id]: token
    }));
    setRecognizedTrail((previous) => (previous ? `${previous} ${token}` : token));
    setLastRecognizedToken(token);
    setHiddenPrediction("No prediction yet.");
  }, [hiddenPrediction, blockedTokenAfterClear, lastRecognizedToken, activeStep.id]);

  function markCurrentStepDone() {
    if (!currentDetectedGesture) {
      setError("No recognized gesture detected yet. Keep your hand visible and try again.");
      return;
    }
    setError(null);
    setCompletedStepIds((previous) =>
      previous.includes(activeStep.id) ? previous : [...previous, activeStep.id]
    );
  }

  function goNextStep() {
    setError(null);
    setActiveStepIndex((index) => Math.min(targets.length - 1, index + 1));
  }

  async function finishAssessment() {
    if (!reachedMinimum) {
      setError(`Please complete at least ${minimumRequired} gestures before submitting.`);
      return;
    }
    setError(null);
    setSubmitted(true);
    if (!reported) {
      const total = targets.length;
      const right = completedStepIds.length;
      const wrong = Math.max(0, total - right);
      const improvementAreas = targets
        .filter((step) => !completedStepIds.includes(step.id))
        .map((step) => `Practice gesture: ${step.label}`);
      const didPersist = await persistAssessmentResult(onSubmitResult, {
        assessmentId,
        assessmentTitle: title,
        right,
        wrong,
        total,
        scorePercent: total > 0 ? Math.round((right / total) * 100) : 0,
        improvementAreas,
        source: "student_module_camera",
        items: targets.map((step) => {
          const studentAnswer = recognizedByStep[step.id]?.trim() ?? "";
          return {
            itemKey: step.id,
            prompt: `Sign gesture: ${step.label}`,
            expectedAnswer: step.label,
            studentAnswer: studentAnswer || null,
            isCorrect: completedStepIds.includes(step.id),
          };
        }),
      });
      if (didPersist) {
        setReported(true);
      }
    }
  }

  function clearCurrentInput() {
    const token = hiddenPrediction.trim();
    if (isValidPredictionToken(token)) {
      setBlockedTokenAfterClear(token);
    } else {
      setBlockedTokenAfterClear(null);
    }
    setRecognizedTrail("");
    setRecognizedByStep((previous) => ({
      ...previous,
      [activeStep.id]: ""
    }));
    setHiddenPrediction("No prediction yet.");
    setLastRecognizedToken(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      <p className="sr-only">{intro}</p>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <video
            autoPlay
            className="h-[300px] w-full rounded-xl border border-slate-300 bg-slate-900 object-cover md:h-[420px]"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={`rounded px-3 py-2 text-xs font-semibold text-white transition ${
                running ? "bg-brandRed hover:bg-brandRed/90" : "bg-brandBlue hover:bg-brandBlue/90"
              }`}
              onClick={() => {
                void toggleCamera();
              }}
              type="button"
            >
              <span className="inline-grid min-w-[92px] place-items-center">
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                  }`}
                >
                  Start Camera
                </span>
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                  }`}
                >
                  Stop Camera
                </span>
              </span>
            </button>
            <button
              className="rounded bg-brandRed px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!running}
              onClick={() => {
                void runHiddenPrediction();
              }}
              type="button"
            >
              Analyze Sign Now
            </button>
            <span className="rounded bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              {running ? "Camera active" : "Camera off"}
            </span>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wider label-accent">Current Gesture</p>
          <div className="mt-2 rounded-xl border border-brandBlue/20 bg-brandBlueLight p-4">
            <p className="text-center text-lg font-bold text-brandBlue">{activeStep.label}</p>
          </div>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider label-accent">
            Recognized Gesture
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              readOnly
              onDrop={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              placeholder="Recognized gesture/phrase appears here..."
              spellCheck={false}
              type="text"
              value={recognizedTrail}
            />
          </label>
          <button
            className="mt-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={clearCurrentInput}
            type="button"
          >
            Clear Input
          </button>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              disabled={activeStepIndex === 0}
              onClick={() => setActiveStepIndex((index) => Math.max(0, index - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              disabled={activeStepIndex === targets.length - 1}
              onClick={goNextStep}
              type="button"
            >
              Next
            </button>
            <button
              className="rounded border border-brandBlue bg-white px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
              onClick={markCurrentStepDone}
              type="button"
            >
              Mark Done
            </button>
            {reachedMinimum ? (
              <button
                className="rounded bg-brandGreen px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandGreen/90"
                onClick={() => {
                  void finishAssessment();
                }}
                type="button"
              >
                Finish / Submit
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Completed: {completedStepIds.length}/{targets.length}
          </p>
          <p className="mt-1 text-xs text-slate-600">Minimum required: {minimumRequired}</p>

          {reachedMinimum ? (
            <p className="mt-3 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
              Requirement reached. You completed at least 7 gestures.
            </p>
          ) : null}

          {allDone ? (
            <p className="mt-2 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
              Assessment complete. All gesture tasks submitted.
            </p>
          ) : null}

          {submitted ? (
            <p className="mt-2 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
              Submitted. Great work completing the gesture requirement.
            </p>
          ) : null}

          <Link
            className="mt-3 inline-flex rounded border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/gesture-tester"
          >
            Open Gesture Tester
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Module3AssessmentTwo({
  onSubmitResult,
}: {
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  return (
    <GestureCameraAssessment
      assessmentId="m3-assessment-2"
      intro="Use the camera interface and sign at least 7 gestures from this module."
      minimumRequired={7}
      onSubmitResult={onSubmitResult}
      targets={MODULE3_GESTURE_TARGETS}
      title="Assessment 2"
    />
  );
}

function Module7ColorAssessmentTwo({
  onSubmitResult,
}: {
  onSubmitResult?: AssessmentSubmitHandler;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [recognizedTrail, setRecognizedTrail] = useState("");
  const [recognizedByStep, setRecognizedByStep] = useState<Record<string, string>>({});
  const [hiddenPrediction, setHiddenPrediction] = useState("No prediction yet.");
  const [lastRecognizedToken, setLastRecognizedToken] = useState<string | null>(null);
  const [blockedTokenAfterClear, setBlockedTokenAfterClear] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  const activeColor = MODULE7_COLOR_SIGN_TARGETS[activeStepIndex];
  const allDone = completedStepIds.length >= MODULE7_COLOR_SIGN_TARGETS.length;
  const currentDetectedGesture = (recognizedByStep[activeColor.id] ?? "").trim();

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setRunning(true);
    } catch {
      setError("Unable to access camera. Check browser permission.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setRunning(false);
  }

  async function toggleCamera() {
    if (running) {
      stopCamera();
      return;
    }
    await startCamera();
  }

  async function runHiddenPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    predictionInFlightRef.current = true;
    try {
      const frame = await captureVideoFrameAsFile(videoRef.current);
      if (!frame) {
        return;
      }
      const result = await predictSignFromImage(frame, "words");
      setHiddenPrediction(result.prediction);
    } catch {
      // Hidden prediction failures should not block user actions.
    } finally {
      predictionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    const token = hiddenPrediction.trim();
    if (!isValidPredictionToken(token)) {
      return;
    }
    if (blockedTokenAfterClear && token === blockedTokenAfterClear) {
      setHiddenPrediction("No prediction yet.");
      return;
    }
    if (blockedTokenAfterClear && token !== blockedTokenAfterClear) {
      setBlockedTokenAfterClear(null);
    }
    if (token === lastRecognizedToken) {
      setHiddenPrediction("No prediction yet.");
      return;
    }

    setRecognizedByStep((previous) => ({
      ...previous,
      [activeColor.id]: token
    }));
    setRecognizedTrail((previous) => (previous ? `${previous} ${token}` : token));
    setLastRecognizedToken(token);
    setHiddenPrediction("No prediction yet.");
  }, [hiddenPrediction, blockedTokenAfterClear, lastRecognizedToken, activeColor.id]);

  async function submitCurrentStep() {
    const value = currentDetectedGesture;
    if (!value) {
      setError("Please wait for a recognized gesture before continuing.");
      return;
    }

    setError(null);
    const nextCompletedStepIds = completedStepIds.includes(activeColor.id)
      ? completedStepIds
      : [...completedStepIds, activeColor.id];
    setCompletedStepIds(nextCompletedStepIds);

    const isLastStep = activeStepIndex >= MODULE7_COLOR_SIGN_TARGETS.length - 1;
    if (!isLastStep) {
      setActiveStepIndex((index) =>
        Math.min(MODULE7_COLOR_SIGN_TARGETS.length - 1, index + 1)
      );
      return;
    }

    if (!reported) {
      const successfulStepIds = new Set([...completedStepIds, activeColor.id]);
      const total = MODULE7_COLOR_SIGN_TARGETS.length;
      const right = successfulStepIds.size;
      const wrong = Math.max(0, total - right);
      const improvementAreas = MODULE7_COLOR_SIGN_TARGETS
        .filter((step) => !successfulStepIds.has(step.id))
        .map((step) => `Practice color sign: ${step.label}`);
      const didPersist = await persistAssessmentResult(onSubmitResult, {
        assessmentId: "m7-assessment-2",
        assessmentTitle: "Assessment 2",
        right,
        wrong,
        total,
        scorePercent: total > 0 ? Math.round((right / total) * 100) : 0,
        improvementAreas,
        source: "student_module_camera",
        items: MODULE7_COLOR_SIGN_TARGETS.map((step) => {
          const studentAnswer = recognizedByStep[step.id]?.trim() ?? "";
          return {
            itemKey: step.id,
            prompt: `Sign displayed color: ${step.label}`,
            expectedAnswer: step.label,
            studentAnswer: studentAnswer || null,
            isCorrect: successfulStepIds.has(step.id),
          };
        }),
      });
      if (didPersist) {
        setReported(true);
      }
    }
  }

  function clearCurrentInput() {
    const token = hiddenPrediction.trim();
    if (isValidPredictionToken(token)) {
      setBlockedTokenAfterClear(token);
    } else {
      setBlockedTokenAfterClear(null);
    }
    setRecognizedTrail("");
    setRecognizedByStep((previous) => ({
      ...previous,
      [activeColor.id]: ""
    }));
    setHiddenPrediction("No prediction yet.");
    setLastRecognizedToken(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xl font-semibold text-slate-900">Assessment 2</h3>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <video
            autoPlay
            className="h-[300px] w-full rounded-xl border border-slate-300 bg-slate-900 object-cover md:h-[420px]"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={`rounded px-3 py-2 text-xs font-semibold text-white transition ${
                running ? "bg-brandRed hover:bg-brandRed/90" : "bg-brandBlue hover:bg-brandBlue/90"
              }`}
              onClick={() => {
                void toggleCamera();
              }}
              type="button"
            >
              <span className="inline-grid min-w-[92px] place-items-center">
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                  }`}
                >
                  Start Camera
                </span>
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                  }`}
                >
                  Stop Camera
                </span>
              </span>
            </button>
            <button
              className="rounded bg-brandRed px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!running}
              onClick={() => {
                void runHiddenPrediction();
              }}
              type="button"
            >
              Analyze Sign Now
            </button>
            <span className="rounded bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              {running ? "Camera active" : "Camera off"}
            </span>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wider label-accent">Displayed Color</p>
          <div
            className="mt-2 flex h-28 items-center justify-center rounded-xl border border-slate-300"
            style={{ backgroundColor: activeColor.colorHex }}
          >
            <span className="text-xl font-bold text-white">{activeColor.label}</span>
          </div>

          <p className="mt-3 text-sm text-slate-700">
            Sign the color shown above. The recognized output appears automatically below.
          </p>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider label-accent">
            Recognized Gesture
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              readOnly
              onDrop={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              placeholder="Recognized gesture/phrase appears here..."
              spellCheck={false}
              type="text"
              value={recognizedTrail}
            />
          </label>
          <button
            className="mt-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={clearCurrentInput}
            type="button"
          >
            Clear Input
          </button>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              disabled={activeStepIndex === 0}
              onClick={() => setActiveStepIndex((index) => Math.max(0, index - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              onClick={() => {
                void submitCurrentStep();
              }}
              type="button"
            >
              {activeStepIndex === MODULE7_COLOR_SIGN_TARGETS.length - 1 ? "Submit" : "Next"}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Completed: {completedStepIds.length}/{MODULE7_COLOR_SIGN_TARGETS.length}
          </p>

          {allDone ? (
            <p className="mt-3 rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
              Great work. You completed all displayed colors.
            </p>
          ) : null}

          <Link
            className="mt-3 inline-flex rounded border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/gesture-tester"
          >
            Open Gesture Tester
          </Link>
        </aside>
      </div>
    </div>
  );
}

export function ModuleDetailViewer({
  moduleId,
  viewerRole = "student",
  readOnly = false,
  storageScope,
  backHref = "/modules",
  backLabel = "Back To Module Cards",
  headerTitle = "Learning Module",
  headerEyebrow,
  readOnlyNote,
}: ModuleDetailViewerProps) {
  const moduleScopeKey = `${storageScope ?? `${viewerRole}-module-detail`}:${
    Number.isNaN(moduleId) ? "unknown" : moduleId
  }`;

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useSessionState<"module" | "assessment">(
    `${moduleScopeKey}:activeTab`,
    "module"
  );
  const [selectedLessonId, setSelectedLessonId] = useSessionState<string | null>(
    `${moduleScopeKey}:selectedLessonId`,
    null
  );
  const [selectedAssessmentId, setSelectedAssessmentId] = useSessionState<string | null>(
    `${moduleScopeKey}:selectedAssessmentId`,
    null
  );
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useSessionState<boolean>(
    `${moduleScopeKey}:isSelectionCollapsed`,
    false
  );
  const [assessmentSaveState, setAssessmentSaveState] = useState<{
    status: "idle" | "saving" | "saved" | "error";
    message: string | null;
  }>({ status: "idle", message: null });

  useEffect(() => {
    setError(null);
    if (Number.isNaN(moduleId)) {
      setError("Invalid module id.");
      return;
    }

    setLoading(true);
    getModules()
      .then(setModules)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [moduleId]);

  const selected = useMemo(
    () => modules.find((module) => module.id === moduleId) ?? null,
    [modules, moduleId]
  );

  useEffect(() => {
    if (!selected) {
      setSelectedLessonId(null);
      setSelectedAssessmentId(null);
      return;
    }

    const lessonExists = selectedLessonId
      ? selected.lessons.some((lesson) => lesson.id === selectedLessonId)
      : false;
    if (!lessonExists) {
      setSelectedLessonId(selected.lessons[0]?.id ?? null);
    }

    const availableAssessmentIds = getAvailableAssessmentIds(selected);
    const assessmentExists = selectedAssessmentId
      ? availableAssessmentIds.includes(selectedAssessmentId)
      : false;
    if (!assessmentExists) {
      setSelectedAssessmentId(availableAssessmentIds[0] ?? null);
    }
  }, [selected, selectedLessonId, selectedAssessmentId, setSelectedLessonId, setSelectedAssessmentId]);

  useEffect(() => {
    setAssessmentSaveState({ status: "idle", message: null });
  }, [moduleId, selectedAssessmentId]);

  const selectedLesson = useMemo(
    () => selected?.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [selected, selectedLessonId]
  );

  const selectedAssessment = useMemo(
    () => selected?.assessments.find((assessment) => assessment.id === selectedAssessmentId) ?? null,
    [selected, selectedAssessmentId]
  );

  const isModule1 = selected?.slug === "fsl-alphabets";
  const isModule2 = selected?.slug === "numbers";
  const isModule3 = selected?.slug === "common-words";
  const isModule4 = selected?.slug === "family-members";
  const isModule5 = selected?.slug === "people-description";
  const isModule6 = selected?.slug === "days";
  const isModule7 = selected?.slug === "colors-descriptions";
  const isModule8 = selected?.slug === "basic-conversations";
  const module1AssessmentQuestions = useMemo(() => {
    if (!isModule1 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule1, selected]);
  const module2AssessmentQuestions = useMemo(() => {
    if (!isModule2 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule2, selected]);
  const module3AssessmentQuestions = useMemo(() => {
    if (!isModule3 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule3, selected]);
  const module4AssessmentQuestions = useMemo(() => {
    if (!isModule4 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule4, selected]);
  const module5AssessmentQuestions = useMemo(() => {
    if (!isModule5 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule5, selected]);
  const module6AssessmentQuestions = useMemo(() => {
    if (!isModule6 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule6, selected]);
  const module7AssessmentQuestions = useMemo(() => {
    if (!isModule7 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule7, selected]);
  const module8AssessmentQuestions = useMemo(() => {
    if (!isModule8 || !selected) {
      return [];
    }
    return selected.assessments.slice(0, 5);
  }, [isModule8, selected]);

  async function handleAssessmentResult(payload: AssessmentReportPayload) {
    if (readOnly) {
      setAssessmentSaveState({
        status: "error",
        message: readOnlyNote ?? "Teacher preview mode does not save activity attempts.",
      });
      return false;
    }

    if (!selected) {
      setAssessmentSaveState({
        status: "error",
        message: "This module is not loaded yet. Please refresh and try again.",
      });
      return false;
    }

    setAssessmentSaveState({
      status: "saving",
      message: `Saving ${payload.assessmentTitle}...`,
    });

    try {
      const response = await submitActivityAttempt(moduleId, payload.assessmentId, {
        right_count: payload.right,
        wrong_count: payload.wrong,
        total_items: payload.total,
        score_percent: payload.scorePercent,
        improvement_areas: payload.improvementAreas,
        source: payload.source ?? "student_module",
        notes: payload.notes ?? null,
        items: (payload.items ?? []).map((item) => ({
          item_key: item.itemKey,
          prompt: item.prompt ?? null,
          expected_answer: item.expectedAnswer ?? null,
          student_answer: item.studentAnswer ?? null,
          is_correct: item.isCorrect ?? null,
          confidence: item.confidence ?? null,
          ai_metadata: item.aiMetadata ?? {},
        })),
        completed_lesson_id: selectedLessonId ?? null,
        mark_module_completed: payload.markModuleCompleted ?? false,
      });

      setModules((previous) =>
        previous.map((module) => (module.id === moduleId ? response.progress : module))
      );
      setAssessmentSaveState({
        status: "saved",
        message: `${response.activity_title} saved. Teachers can now see this score and progress.`,
      });
      return true;
    } catch (requestError) {
      setAssessmentSaveState({
        status: "error",
        message:
          requestError instanceof Error
            ? requestError.message
            : "Unable to save the assessment result.",
      });
      return false;
    }
  }

  function openModuleTab() {
    setActiveTab("module");
    if (!selectedLessonId && selected?.lessons.length) {
      setSelectedLessonId(selected.lessons[0].id);
    }
  }

  function openAssessmentTab() {
    setActiveTab("assessment");
    if (isModule1) {
      setSelectedAssessmentId("m1-assessment-1");
      return;
    }
    if (isModule2) {
      setSelectedAssessmentId("m2-assessment-1");
      return;
    }
    if (isModule3) {
      setSelectedAssessmentId("m3-assessment-1");
      return;
    }
    if (isModule4) {
      setSelectedAssessmentId("m4-assessment-1");
      return;
    }
    if (isModule5) {
      setSelectedAssessmentId("m5-assessment-1");
      return;
    }
    if (isModule6) {
      setSelectedAssessmentId("m6-assessment-1");
      return;
    }
    if (isModule7) {
      setSelectedAssessmentId("m7-assessment-1");
      return;
    }
    if (isModule8) {
      setSelectedAssessmentId("m8-assessment-1");
      return;
    }
    if (!selectedAssessmentId && selected?.assessments.length) {
      setSelectedAssessmentId(selected.assessments[0].id);
    }
  }

  function renderReadOnlyAssessment(): ReactNode {
    const previewNotice =
      readOnlyNote ??
      "Teacher preview only. Assessment interactions are disabled here, so no progress or attempt data will be saved.";

    if (selectedAssessment) {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Preview the question content and answer choices exactly where students would encounter them."
          title={selectedAssessment.question}
        >
          <div>
            <p className="text-xs uppercase tracking-wider label-accent">Choices</p>
            <ul className="mt-2 space-y-2">
              {selectedAssessment.choices.map((choice) => (
                <li
                  className="rounded-lg border border-brandBlue/25 bg-brandBlueLight px-3 py-2 text-sm text-slate-700"
                  key={choice}
                >
                  {choice}
                </li>
              ))}
            </ul>
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule1 && selectedAssessmentId === "m1-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module1AssessmentQuestions}
          subtitle="Full Module A-Z multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule1 && selectedAssessmentId === "m1-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Label the hand sign cards students see in the image-based assessment."
          title="Assessment 2"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODULE1_LABELING_ITEMS.map((item) => (
              <div
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
                key={item.id}
              >
                <img
                  alt={`Assessment sign ${item.answer}`}
                  className="h-48 w-full bg-[#2f6a16] object-cover object-center"
                  loading="lazy"
                  src={item.src}
                />
                <div className="border-t border-slate-200 bg-white px-3 py-3">
                  <p className="text-sm font-semibold text-slate-900">Hand Sign Prompt</p>
                  <p className="mt-1 text-xs text-slate-500">Teacher key: {item.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule1 && selectedAssessmentId === "m1-assessment-3") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Preview the signing challenge prompts and their order without opening the student capture flow."
          title="Assessment 3"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE1_SIGNING_CHALLENGE_STEPS.map((step) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={step.id}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brandBlue">
                  {step.title}
                </p>
                <p className="mt-2 text-sm text-slate-700">{step.prompt}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule2 && selectedAssessmentId === "m2-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module2AssessmentQuestions}
          subtitle="Numbers multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule2 && selectedAssessmentId === "m2-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign each number from 1 to 10."
          title="Assessment 2"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODULE2_SIGN_1_TO_10_STEPS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">Target Number</p>
                <p className="mt-2 text-2xl font-black text-brandBlue">{target.number}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule2 && selectedAssessmentId === "m2-assessment-3") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign numbers from 11 to 20. Complete at least 5."
          title="Assessment 3"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODULE2_SIGN_11_TO_20_STEPS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">Target Number</p>
                <p className="mt-2 text-2xl font-black text-brandBlue">{target.number}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule2 && selectedAssessmentId === "m2-assessment-4") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign numbers from 31 to 40. Complete at least 5."
          title="Assessment 4"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODULE2_SIGN_31_TO_40_STEPS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">Target Number</p>
                <p className="mt-2 text-2xl font-black text-brandBlue">{target.number}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule2 && selectedAssessmentId === "m2-assessment-5") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign numbers from 91 to 100. Complete at least 5."
          title="Assessment 5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODULE2_SIGN_91_TO_100_STEPS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">Target Number</p>
                <p className="mt-2 text-2xl font-black text-brandBlue">{target.number}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule3 && selectedAssessmentId === "m3-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module3AssessmentQuestions}
          subtitle="Greetings and basic expressions multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule3 && selectedAssessmentId === "m3-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign at least 7 gestures from this module."
          title="Assessment 2"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE3_GESTURE_TARGETS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">{target.label}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule4 && selectedAssessmentId === "m4-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module4AssessmentQuestions}
          subtitle="Family members multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule4 && selectedAssessmentId === "m4-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign at least 7 gestures from this module."
          title="Assessment 2"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE4_GESTURE_TARGETS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">{target.label}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule5 && selectedAssessmentId === "m5-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module5AssessmentQuestions}
          subtitle="People description multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule5 && selectedAssessmentId === "m5-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign at least 7 gestures from this module."
          title="Assessment 2"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE5_GESTURE_TARGETS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">{target.label}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule6 && selectedAssessmentId === "m6-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module6AssessmentQuestions}
          subtitle="Days multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule6 && selectedAssessmentId === "m6-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign at least 7 gestures from this module."
          title="Assessment 2"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE6_GESTURE_TARGETS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">{target.label}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule7 && selectedAssessmentId === "m7-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module7AssessmentQuestions}
          subtitle="Colors and descriptions multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule7 && selectedAssessmentId === "m7-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Preview the displayed colors students are asked to sign in sequence."
          title="Assessment 2"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODULE7_COLOR_SIGN_TARGETS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <div
                  className="h-24 rounded-lg border border-slate-200"
                  style={{ backgroundColor: target.colorHex }}
                />
                <p className="mt-3 text-sm font-semibold text-slate-900">{target.label}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule7 && selectedAssessmentId === "m7-assessment-3") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign at least 7 gestures from this module."
          title="Assessment 3"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE7_GESTURE_TARGETS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">{target.label}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    if (isModule8 && selectedAssessmentId === "m8-assessment-1") {
      return (
        <MultipleChoicePreview
          notice={previewNotice}
          questions={module8AssessmentQuestions}
          subtitle="Basic conversations multiple-choice preview."
          title="Assessment 1"
        />
      );
    }

    if (isModule8 && selectedAssessmentId === "m8-assessment-2") {
      return (
        <ReadOnlyAssessmentShell
          notice={previewNotice}
          subtitle="Use the camera interface and sign at least 7 gestures from this module."
          title="Assessment 2"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE8_GESTURE_TARGETS.map((target) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={target.id}>
                <p className="text-sm font-semibold text-slate-900">{target.label}</p>
              </div>
            ))}
          </div>
        </ReadOnlyAssessmentShell>
      );
    }

    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Pick an assessment item from the left panel to view its preview content.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            {headerEyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                {headerEyebrow}
              </p>
            ) : null}
            <h2 className="text-2xl font-semibold title-gradient">{headerTitle}</h2>
          </div>
          <Link
            className="rounded border border-brandBlue bg-brandBlue px-3 py-1 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
            href={backHref}
          >
            {backLabel}
          </Link>
        </div>
        {readOnly && readOnlyNote ? (
          <p className="mt-3 max-w-3xl text-sm text-slate-600">{readOnlyNote}</p>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-muted">Loading module...</p> : null}

      {!loading && !selected ? (
        <div className="panel">
          <p className="text-sm text-red-600">Module not found.</p>
        </div>
      ) : null}

      {selected ? (
        <article className="panel">
          {!readOnly ? (
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Session
                </p>
                <p className="mt-2 text-sm font-black text-slate-900">
                  {selected.module_kind === "system"
                    ? `Week ${selected.order_index} of 12`
                    : "Teacher Module"}
                </p>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Time Guide
                </p>
                <p className="mt-2 text-sm font-black text-slate-900">Up to 2 hours</p>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Saved Progress
                </p>
                <p className="mt-2 text-sm font-black text-slate-900">
                  {selected.progress_percent}% complete
                </p>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Latest Score
                </p>
                <p className="mt-2 text-sm font-black text-slate-900">
                  {selected.assessment_score === null
                    ? "No score yet"
                    : `${selected.assessment_score.toFixed(0)}%`}
                </p>
              </div>
            </div>
          ) : null}

          {!readOnly ? (
            <div className="mb-4 rounded-xl border border-brandBlue/20 bg-brandBlueLight px-4 py-3 text-sm text-slate-700">
              Saved assessment attempts update your module progress immediately, and your teacher
              can review the score you submit for this session.
            </div>
          ) : null}

          <div className="mb-3 flex justify-start">
            <button
              className="rounded border border-brandBlue bg-brandBlue px-3 py-1 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
              onClick={() => setIsSelectionCollapsed((value) => !value)}
              type="button"
            >
              {isSelectionCollapsed ? "Show Module/Assessment List" : "Hide Module/Assessment List"}
            </button>
          </div>
          <div className={`grid gap-4 ${isSelectionCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-[20rem_1fr]"}`}>
            {!isSelectionCollapsed ? (
            <aside className="rounded-xl border border-brandBorder bg-brandMutedSurface p-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    activeTab === "module"
                      ? "border-brandBlue bg-brandBlueLight text-brandBlue"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={openModuleTab}
                  type="button"
                >
                  Module
                </button>
                <button
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    activeTab === "assessment"
                      ? "border-brandRed bg-brandRedLight text-brandRed"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={openAssessmentTab}
                  type="button"
                >
                  Assessment
                </button>
              </div>

              <p className="mt-3 text-xs uppercase tracking-wider label-accent">
                {activeTab === "module" ? "Select a lesson" : "Select an assessment"}
              </p>

              <div className="mt-2 space-y-2">
                {activeTab === "module" ? (
                  selected.lessons.length > 0 ? (
                    selected.lessons.map((lesson) => (
                      <button
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                          selectedLessonId === lesson.id
                            ? "border-brandGreen bg-brandGreenLight text-slate-900"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                        key={lesson.id}
                        onClick={() => setSelectedLessonId(lesson.id)}
                        type="button"
                      >
                        <p className="font-semibold">{lesson.title}</p>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
                      No lessons found for this module.
                    </p>
                  )
                ) : isModule1 ? (
                  MODULE1_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : isModule2 ? (
                  MODULE2_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : isModule3 ? (
                  MODULE3_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : isModule4 ? (
                  MODULE4_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : isModule5 ? (
                  MODULE5_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : isModule6 ? (
                  MODULE6_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : isModule7 ? (
                  MODULE7_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : isModule8 ? (
                  MODULE8_ASSESSMENT_OPTIONS.map((assessment) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">{assessment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.subtitle}</p>
                    </button>
                  ))
                ) : selected.assessments.length > 0 ? (
                  selected.assessments.map((assessment, index) => (
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedAssessmentId === assessment.id
                          ? "border-brandRed bg-brandRedLight text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={assessment.id}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                      type="button"
                    >
                      <p className="font-semibold">Question {index + 1}</p>
                      <p className="mt-1 text-xs text-slate-500">{assessment.question}</p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
                    No assessment available yet.
                  </p>
                )}
              </div>
            </aside>
            ) : null}

            <div className="rounded-xl border border-brandBorder bg-white p-4">
              {activeTab === "assessment" && !readOnly && assessmentSaveState.message ? (
                <div
                  className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                    assessmentSaveState.status === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : assessmentSaveState.status === "saved"
                        ? "border-brandGreen/30 bg-brandGreenLight text-slate-800"
                        : "border-brandBlue/20 bg-brandBlueLight text-slate-800"
                  }`}
                >
                  {assessmentSaveState.message}
                </div>
              ) : null}
              {activeTab === "module" ? (
                <>
                  <p className="text-sm font-extrabold uppercase tracking-wide text-slate-900">{selected.title}</p>
                  <p className="mt-2 text-lg leading-8 text-slate-900">{selected.description}</p>
                  {selectedLesson ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-xl font-semibold text-slate-900">{selectedLesson.title}</h3>
                    <p className="mt-3 whitespace-pre-line text-base leading-8 text-slate-900">
                      {selectedLesson.content}
                    </p>

                    {selected.slug === "fsl-alphabets" && selectedLesson.id === "m1-l1" ? (
                      <div className="mt-5">
                        <p className="text-xs uppercase tracking-wider label-accent">A-I Sign Cards</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {MODULE1_AI_SIGN_IMAGES.map((card) => (
                            <SignCardImage key={card.letter} letter={card.letter} src={card.src} />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selected.slug === "fsl-alphabets" && selectedLesson.id === "m1-l2" ? (
                      <div className="mt-5 space-y-5">
                        <div>
                          <p className="text-xs uppercase tracking-wider label-accent">Special Motion Gesture</p>
                          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Letter J Motion Demo</p>
                            <p className="text-sm text-slate-600">
                              J is a moving sign. Follow the short curved motion while keeping the handshape clear.
                            </p>
                            <MotionVideoCard letter="J" src={MODULE1_J_MOTION_VIDEO} />
                          </div>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wider label-accent">J-R Sign Cards</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {MODULE1_JR_SIGN_IMAGES.map((card) => (
                              <SignCardImage key={card.letter} letter={card.letter} src={card.src} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {selected.slug === "fsl-alphabets" && selectedLesson.id === "m1-l3" ? (
                      <div className="mt-5 space-y-5">
                        <div>
                          <p className="text-xs uppercase tracking-wider label-accent">S-Z Sign Cards</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {MODULE1_SZ_SIGN_IMAGES.map((card) => (
                              <SignCardImage key={card.letter} letter={card.letter} src={card.src} />
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wider label-accent">Special Motion Gesture</p>
                          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Letter Z Motion Demo</p>
                            <p className="text-sm text-slate-600">
                              Z is a moving sign. Trace the Z path clearly and keep hand orientation consistent.
                            </p>
                            <MotionVideoCard letter="Z" src={MODULE1_Z_MOTION_VIDEO} />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {LESSON_VIDEO_MAP[selectedLesson.id] ? (
                      <LessonVideoCard
                        src={LESSON_VIDEO_MAP[selectedLesson.id].src}
                        title={LESSON_VIDEO_MAP[selectedLesson.id].title}
                      />
                    ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Pick a lesson from the left panel to view its content.
                    </div>
                  )}
                </>
              ) : readOnly ? (
                renderReadOnlyAssessment()
              ) : selectedAssessment ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-xl font-semibold text-slate-900">{selectedAssessment.question}</h3>
                  <p className="mt-3 text-xs uppercase tracking-wider label-accent">Choices</p>
                  <ul className="mt-2 space-y-2">
                    {selectedAssessment.choices.map((choice) => (
                      <li className="rounded-lg border border-brandBlue/25 bg-brandBlueLight px-3 py-2 text-sm text-slate-700" key={choice}>
                        {choice}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : isModule1 && selectedAssessmentId === "m1-assessment-1" ? (
                <Module1AssessmentOne
                  onSubmitResult={handleAssessmentResult}
                  questions={module1AssessmentQuestions}
                />
              ) : isModule1 && selectedAssessmentId === "m1-assessment-2" ? (
                <Module1AssessmentTwo onSubmitResult={handleAssessmentResult} />
              ) : isModule1 && selectedAssessmentId === "m1-assessment-3" ? (
                <Module1AssessmentThree onSubmitResult={handleAssessmentResult} />
              ) : isModule2 && selectedAssessmentId === "m2-assessment-1" ? (
                <Module2AssessmentOne
                  assessmentId="m2-assessment-1"
                  onSubmitResult={handleAssessmentResult}
                  moduleLabel="Numbers"
                  questions={module2AssessmentQuestions}
                />
              ) : isModule2 && selectedAssessmentId === "m2-assessment-2" ? (
                <NumbersCameraAssessment
                  assessmentId="m2-assessment-2"
                  intro="Use the camera interface and sign each number from 1 to 10."
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE2_SIGN_1_TO_10_STEPS}
                  title="Assessment 2"
                />
              ) : isModule2 && selectedAssessmentId === "m2-assessment-3" ? (
                <NumbersCameraAssessment
                  assessmentId="m2-assessment-3"
                  intro="Use the camera interface and sign numbers from 11 to 20. Complete at least 5."
                  minimumRequired={5}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE2_SIGN_11_TO_20_STEPS}
                  title="Assessment 3"
                />
              ) : isModule2 && selectedAssessmentId === "m2-assessment-4" ? (
                <NumbersCameraAssessment
                  assessmentId="m2-assessment-4"
                  intro="Use the camera interface and sign numbers from 31 to 40. Complete at least 5."
                  minimumRequired={5}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE2_SIGN_31_TO_40_STEPS}
                  title="Assessment 4"
                />
              ) : isModule2 && selectedAssessmentId === "m2-assessment-5" ? (
                <NumbersCameraAssessment
                  assessmentId="m2-assessment-5"
                  intro="Use the camera interface and sign numbers from 91 to 100. Complete at least 5."
                  minimumRequired={5}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE2_SIGN_91_TO_100_STEPS}
                  title="Assessment 5"
                />
              ) : isModule3 && selectedAssessmentId === "m3-assessment-1" ? (
                <Module2AssessmentOne
                  assessmentId="m3-assessment-1"
                  onSubmitResult={handleAssessmentResult}
                  moduleLabel="Greetings & Basic Expressions"
                  questions={module3AssessmentQuestions}
                />
              ) : isModule3 && selectedAssessmentId === "m3-assessment-2" ? (
                <Module3AssessmentTwo onSubmitResult={handleAssessmentResult} />
              ) : isModule4 && selectedAssessmentId === "m4-assessment-1" ? (
                <Module2AssessmentOne
                  assessmentId="m4-assessment-1"
                  onSubmitResult={handleAssessmentResult}
                  moduleLabel="Family Members"
                  questions={module4AssessmentQuestions}
                />
              ) : isModule4 && selectedAssessmentId === "m4-assessment-2" ? (
                <GestureCameraAssessment
                  assessmentId="m4-assessment-2"
                  intro="Use the camera interface and sign at least 7 gestures from this module."
                  minimumRequired={7}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE4_GESTURE_TARGETS}
                  title="Assessment 2"
                />
              ) : isModule5 && selectedAssessmentId === "m5-assessment-1" ? (
                <Module2AssessmentOne
                  assessmentId="m5-assessment-1"
                  onSubmitResult={handleAssessmentResult}
                  moduleLabel="People Description"
                  questions={module5AssessmentQuestions}
                />
              ) : isModule5 && selectedAssessmentId === "m5-assessment-2" ? (
                <GestureCameraAssessment
                  assessmentId="m5-assessment-2"
                  intro="Use the camera interface and sign at least 7 gestures from this module."
                  minimumRequired={7}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE5_GESTURE_TARGETS}
                  title="Assessment 2"
                />
              ) : isModule6 && selectedAssessmentId === "m6-assessment-1" ? (
                <Module2AssessmentOne
                  assessmentId="m6-assessment-1"
                  onSubmitResult={handleAssessmentResult}
                  moduleLabel="Days"
                  questions={module6AssessmentQuestions}
                />
              ) : isModule6 && selectedAssessmentId === "m6-assessment-2" ? (
                <GestureCameraAssessment
                  assessmentId="m6-assessment-2"
                  intro="Use the camera interface and sign at least 7 gestures from this module."
                  minimumRequired={7}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE6_GESTURE_TARGETS}
                  title="Assessment 2"
                />
              ) : isModule7 && selectedAssessmentId === "m7-assessment-1" ? (
                <Module2AssessmentOne
                  assessmentId="m7-assessment-1"
                  onSubmitResult={handleAssessmentResult}
                  moduleLabel="Colors & Descriptions"
                  questions={module7AssessmentQuestions}
                />
              ) : isModule7 && selectedAssessmentId === "m7-assessment-2" ? (
                <Module7ColorAssessmentTwo onSubmitResult={handleAssessmentResult} />
              ) : isModule7 && selectedAssessmentId === "m7-assessment-3" ? (
                <GestureCameraAssessment
                  assessmentId="m7-assessment-3"
                  intro="Use the camera interface and sign at least 7 gestures from this module."
                  minimumRequired={7}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE7_GESTURE_TARGETS}
                  title="Assessment 3"
                />
              ) : isModule8 && selectedAssessmentId === "m8-assessment-1" ? (
                <Module2AssessmentOne
                  assessmentId="m8-assessment-1"
                  onSubmitResult={handleAssessmentResult}
                  moduleLabel="Basic Conversations"
                  questions={module8AssessmentQuestions}
                />
              ) : isModule8 && selectedAssessmentId === "m8-assessment-2" ? (
                <GestureCameraAssessment
                  assessmentId="m8-assessment-2"
                  intro="Use the camera interface and sign at least 7 gestures from this module."
                  minimumRequired={7}
                  onSubmitResult={handleAssessmentResult}
                  targets={MODULE8_GESTURE_TARGETS}
                  title="Assessment 2"
                />
              ) : (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Pick an assessment item from the left panel to view the question and choices.
                </div>
              )}
            </div>
          </div>
        </article>
      ) : null}

      {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
    </section>
  );
}
