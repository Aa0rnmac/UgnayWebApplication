import {
  AlphabetModelStatus,
  ModuleItem,
  NumbersModelStatus,
  TeacherReportSummary,
  WordsModelStatus,
  getAlphabetModelStatus,
  getModule,
  getModules,
  getNumbersModelStatus,
  getTeacherBatches,
  getTeacherEnrollments,
  getTeacherReportSummary,
  getWordsModelStatus,
} from "@/lib/api";

export type TeacherLabMode = "alphabet" | "numbers" | "words";

export type TeacherModulePracticeGuide = {
  moduleId: number;
  moduleTitle: string;
  labMode: TeacherLabMode;
  labModeLabel: string;
  selectorHint: string;
  prepFocus: string;
};

export type TeacherModuleCatalogData = {
  mode: "real";
  modules: ModuleItem[];
  totalLessons: number;
  totalActivities: number;
  publishedModules: number;
  draftModules: number;
  practiceGuides: TeacherModulePracticeGuide[];
};

export type TeacherModuleDetailData = {
  mode: "real";
  module: ModuleItem;
  practiceGuide: TeacherModulePracticeGuide;
};

export type TeacherLabModeStatus = {
  source: "real";
  mode: TeacherLabMode;
  title: string;
  readiness: "ready" | "attention";
  summary: string;
  detail: string;
  selectorHint: string;
};

export type TeacherLabWorkspaceData = {
  mode: "real";
  statuses: TeacherLabModeStatus[];
  guides: TeacherModulePracticeGuide[];
  summary: {
    readyModes: number;
    attentionModes: number;
    guidedModules: number;
  };
};

export type TeacherWorkspaceSnapshot = {
  sources: {
    enrollments: "real";
    modules: "real";
    reports: "real";
    lab: "real";
  };
  pendingEnrollments: number;
  approvedStudents: number;
  totalBatches: number;
  liveModules: number;
  draftModules: number;
  trackedStudents: number;
  totalAttempts: number;
  attentionStudents: number;
  weakItems: number;
  readyLabModes: number;
  totalLabModes: number;
  labAttentionModes: number;
  nextStep: string;
};

type TeacherLabSource = {
  alphabetStatus: AlphabetModelStatus;
  numbersStatus: NumbersModelStatus;
  wordsStatus: WordsModelStatus;
};

function createResettableInFlightLoader<T>(loader: () => Promise<T>) {
  let inFlight: Promise<T> | null = null;

  return {
    async load(): Promise<T> {
      if (inFlight) {
        return inFlight;
      }

      inFlight = loader().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
    invalidate() {
      inFlight = null;
    },
  };
}

let cachedModules: ModuleItem[] | null = null;

const sharedModulesLoader = createResettableInFlightLoader(async () => {
  const modules = await getModules();
  cachedModules = modules;
  return modules;
});

const teacherLabLoader = createResettableInFlightLoader<TeacherLabSource>(async () => {
  const [alphabetStatus, numbersStatus, wordsStatus] = await Promise.all([
    getAlphabetModelStatus(),
    getNumbersModelStatus(),
    getWordsModelStatus(),
  ]);

  return { alphabetStatus, numbersStatus, wordsStatus };
});

function getCachedModuleById(moduleId: number): ModuleItem | null {
  return cachedModules?.find((module) => module.id === moduleId) ?? null;
}

function buildTeacherModulePracticeGuide(module: ModuleItem): TeacherModulePracticeGuide {
  if (!module.is_published) {
    return {
      moduleId: module.id,
      moduleTitle: module.title,
      labMode: "words",
      labModeLabel: "Draft module",
      selectorHint: "Draft modules are visible to teachers, but keep them in review until assets and labels are complete.",
      prepFocus:
        "Use this slot for curriculum review, asset QA, and activity planning before the module is opened to students.",
    };
  }

  switch (module.order_index) {
    case 1:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "alphabet",
        labModeLabel: "Alphabet",
        selectorHint: "Choose Alphabet mode in the lab, then rehearse single-letter clarity before scoring attempts.",
        prepFocus:
          "Coach handshape consistency and make students pause clearly before they commit each sign.",
      };
    case 2:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "numbers",
        labModeLabel: "Numbers",
        selectorHint: "Choose Numbers mode, then match the correct range before running a practical activity.",
        prepFocus:
          "Use static digit checks for 0-10 and motion capture for the higher number ranges.",
      };
    case 3:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "words",
        labModeLabel: "Words / Greetings",
        selectorHint: "Choose Words mode and set the category to Greeting.",
        prepFocus:
          "Great for warm-ups, short expression drills, and checking whether students transition cleanly between gestures.",
      };
    case 4:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "words",
        labModeLabel: "Words / Family",
        selectorHint: "Choose Words mode and set the category to Family.",
        prepFocus:
          "Use this lane for family-member signs and quick comparison practice across similar gestures.",
      };
    case 5:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "words",
        labModeLabel: "Words / Relationship",
        selectorHint: "Choose Words mode and set the category to Relationship.",
        prepFocus:
          "Best for identity and people-description language where students often confuse closely related signs.",
      };
    case 6:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "words",
        labModeLabel: "Words / Date",
        selectorHint: "Choose Words mode and set the category to Date.",
        prepFocus:
          "Use the date lane for day-based vocabulary and timing-related recall drills.",
      };
    case 7:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "words",
        labModeLabel: "Words / Color",
        selectorHint: "Choose Words mode and set the category to Color.",
        prepFocus:
          "Good for descriptive vocabulary where visual prompts can be paired with rapid recognition checks.",
      };
    case 8:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "words",
        labModeLabel: "Words / Responses",
        selectorHint: "Choose Words mode and set the category to Responses.",
        prepFocus:
          "Use back-and-forth response practice to reinforce conversational rhythm and confidence.",
      };
    default:
      return {
        moduleId: module.id,
        moduleTitle: module.title,
        labMode: "words",
        labModeLabel: "Words / Review",
        selectorHint: "Use the closest live lab category while the draft module is still under teacher review.",
        prepFocus:
          "Keep the teacher review loop tight here: confirm assets, activity wording, and gesture coverage before release.",
      };
  }
}

function buildTeacherModulePracticeGuides(modules: ModuleItem[]): TeacherModulePracticeGuide[] {
  return modules.map((module) => buildTeacherModulePracticeGuide(module));
}

function getBaselineSystemModules(modules: ModuleItem[]) {
  return modules.filter((module) => module.module_kind === "system");
}

function summarizeModules(modules: ModuleItem[]) {
  return {
    totalLessons: modules.reduce((total, module) => total + module.lessons.length, 0),
    totalActivities: modules.reduce((total, module) => total + module.activities.length, 0),
    publishedModules: modules.filter((module) => module.is_published).length,
    draftModules: modules.filter((module) => !module.is_published).length,
    practiceGuides: buildTeacherModulePracticeGuides(modules),
  };
}

function buildTeacherLabStatuses(
  alphabetStatus: AlphabetModelStatus,
  numbersStatus: NumbersModelStatus,
  wordsStatus: WordsModelStatus
): TeacherLabModeStatus[] {
  return [
    {
      source: "real",
      mode: "alphabet",
      title: "Alphabet",
      readiness: alphabetStatus.ready ? "ready" : "attention",
      summary: alphabetStatus.ready
        ? `${alphabetStatus.classes.length} alphabet classes are ready for live checking.`
        : "Alphabet recognition still needs model readiness before it is classroom-safe.",
      detail: alphabetStatus.ready
        ? "Teachers can use the live lab for letter drills, quick practice checks, and practical camera activities."
        : "Keep alphabet camera activities in teacher review mode until the shared model is marked ready.",
      selectorHint: "Choose Alphabet mode in the lab.",
    },
    {
      source: "real",
      mode: "numbers",
      title: "Numbers",
      readiness: numbersStatus.ready ? "ready" : "attention",
      summary: numbersStatus.ready
        ? numbersStatus.motion_ready
          ? "Static digits and motion-based number ranges are both available."
          : "Static number capture is available, but motion-based ranges still need care."
        : "Numbers recognition still needs model readiness before it is dependable.",
      detail: numbersStatus.ready
        ? numbersStatus.motion_ready
          ? "Teachers can coach both quick static checks and higher-range motion practice in one workspace."
          : "Use this for lower-range number checks first, then verify higher ranges carefully."
        : "Treat number camera work as a review-only lane until the shared model is ready.",
      selectorHint: "Choose Numbers mode, then select the matching range.",
    },
    {
      source: "real",
      mode: "words",
      title: "Words",
      readiness: wordsStatus.ready ? "ready" : "attention",
      summary: wordsStatus.ready
        ? `${wordsStatus.classes.length} trained word labels are available in the live sequence model.`
        : "Word-sequence recognition is not ready yet for reliable teacher coaching.",
      detail: wordsStatus.ready
        ? "Greeting, family, date, color, and response coaching can use the same live sequence flow as the student side."
        : "Keep teacher word coaching focused on lesson review until the shared model is stable.",
      selectorHint: "Choose Words mode and then match the lesson category.",
    },
  ];
}

function summarizeLab(
  statuses: TeacherLabModeStatus[],
  guides: TeacherModulePracticeGuide[]
): TeacherLabWorkspaceData["summary"] {
  const readyModes = statuses.filter((status) => status.readiness === "ready").length;

  return {
    readyModes,
    attentionModes: statuses.length - readyModes,
    guidedModules: guides.length,
  };
}

function deriveNextStep(
  summary: TeacherReportSummary,
  pendingEnrollments: number,
  draftModules: number,
  attentionModes: number
) {
  if (pendingEnrollments > 0) {
    return "Start with the pending enrollment queue so new students can be approved into batches.";
  }
  if (summary.students_needing_attention.length > 0) {
    return "Review the student watchlist next and open the learners whose recent scores are drifting.";
  }
  if (summary.weak_items.length > 0) {
    return "Use the weak-item list to tighten the next teaching pass before the next batch activity run.";
  }
  if (draftModules > 0) {
    return "Review the draft modules and confirm their lesson assets and activity definitions before publishing them.";
  }
  if (attentionModes > 0) {
    return "A lab lane still needs readiness work, so keep practical camera checks teacher-led until it stabilizes.";
  }
  return "Enrollment, reporting, and lab readiness all look healthy. Use the workspace to monitor new activity and refine instruction.";
}

export async function getTeacherModuleCatalogData(): Promise<TeacherModuleCatalogData> {
  const allModules = await sharedModulesLoader.load();
  const modules = getBaselineSystemModules(allModules);
  const moduleSummary = summarizeModules(modules);

  return {
    mode: "real",
    modules,
    totalLessons: moduleSummary.totalLessons,
    totalActivities: moduleSummary.totalActivities,
    publishedModules: moduleSummary.publishedModules,
    draftModules: moduleSummary.draftModules,
    practiceGuides: moduleSummary.practiceGuides,
  };
}

export async function getTeacherModuleDetailData(
  moduleId: number
): Promise<TeacherModuleDetailData> {
  const cachedModule = getCachedModuleById(moduleId);
  const module = cachedModule ?? (await getModule(moduleId));

  return {
    mode: "real",
    module,
    practiceGuide: buildTeacherModulePracticeGuide(module),
  };
}

export async function getTeacherLabData(): Promise<TeacherLabWorkspaceData> {
  const [{ alphabetStatus, numbersStatus, wordsStatus }, allModules] = await Promise.all([
    teacherLabLoader.load(),
    sharedModulesLoader.load(),
  ]);

  const modules = getBaselineSystemModules(allModules);
  const guides = buildTeacherModulePracticeGuides(modules);
  const statuses = buildTeacherLabStatuses(alphabetStatus, numbersStatus, wordsStatus);

  return {
    mode: "real",
    statuses,
    guides,
    summary: summarizeLab(statuses, guides),
  };
}

export async function getTeacherWorkspaceSnapshot(): Promise<TeacherWorkspaceSnapshot> {
  const [allModules, batches, pendingEnrollments, approvedEnrollments, reportSummary, labData] =
    await Promise.all([
      sharedModulesLoader.load(),
      getTeacherBatches(),
      getTeacherEnrollments({ status: "pending" }),
      getTeacherEnrollments({ status: "approved" }),
      getTeacherReportSummary(),
      getTeacherLabData(),
    ]);

  const modules = getBaselineSystemModules(allModules);
  const moduleSummary = summarizeModules(modules);

  return {
    sources: {
      enrollments: "real",
      modules: "real",
      reports: "real",
      lab: "real",
    },
    pendingEnrollments: pendingEnrollments.length,
    approvedStudents: approvedEnrollments.length,
    totalBatches: batches.length,
    liveModules: moduleSummary.publishedModules,
    draftModules: moduleSummary.draftModules,
    trackedStudents: reportSummary.total_students,
    totalAttempts: reportSummary.total_attempts,
    attentionStudents: reportSummary.students_needing_attention.length,
    weakItems: reportSummary.weak_items.length,
    readyLabModes: labData.summary.readyModes,
    totalLabModes: labData.statuses.length,
    labAttentionModes: labData.summary.attentionModes,
    nextStep: deriveNextStep(
      reportSummary,
      pendingEnrollments.length,
      moduleSummary.draftModules,
      labData.summary.attentionModes
    ),
  };
}
