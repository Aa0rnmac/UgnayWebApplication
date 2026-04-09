function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function resolveApiBase(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredBase) {
    if (typeof window !== "undefined") {
      try {
        const configuredUrl = new URL(configuredBase);
        // If frontend is accessed over LAN, but env still points to localhost,
        // auto-rewrite host to the current browser host to avoid network fetch failures.
        if (isLocalHostname(configuredUrl.hostname) && !isLocalHostname(window.location.hostname)) {
          configuredUrl.hostname = window.location.hostname;
          configuredUrl.protocol = window.location.protocol;
          return configuredUrl.toString().replace(/\/$/, "");
        }
      } catch {
        // Ignore malformed env values; fallback logic below will apply.
      }
    }
    return configuredBase;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }

  return "http://localhost:8000/api";
}

export function resolveUploadsBase(): string {
  return resolveApiBase().replace(/\/api\/?$/, "");
}

function getStoredToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const token = window.localStorage.getItem("auth_token");
  return token && token.trim() ? token : undefined;
}

function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type ApiUser = {
  id: number;
  username: string;
  role?: "student" | "teacher" | "admin";
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
  birth_date?: string | null;
  profile_image_path?: string | null;
  must_change_password?: boolean;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

export type ForgotPasswordRequestResponse = {
  message: string;
};

export type TeacherInviteVerifyQrResponse = {
  invite_code: string;
  label: string | null;
  expires_at: string | null;
  remaining_uses: number | null;
  message: string;
};

export type TeacherInviteVerifyPasskeyResponse = {
  onboarding_token: string;
  expires_at: string | null;
  remaining_uses: number | null;
  message: string;
};

export type TeacherInviteIssueCredentialsResponse = {
  message: string;
  username: string;
};

export type TeacherStudentReportRow = {
  student_id: number;
  student_name: string;
  student_email?: string | null;
  total_assessments: number;
  pending_reports: number;
  generated_reports: number;
  average_score_percent: number;
  latest_activity_at?: string | null;
};

export type TeacherStudentReportTableResponse = {
  students: TeacherStudentReportRow[];
};

export type TeacherModuleSummary = {
  module_id: number;
  module_title: string;
  assessments_taken: number;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
};

export type TeacherImprovementAreaItem = {
  area: string;
  count: number;
};

export type TeacherGeneratedStudentReport = {
  student_id: number;
  student_name: string;
  student_email?: string | null;
  generated_at: string;
  total_assessments: number;
  pending_reports_before_generate: number;
  total_right: number;
  total_wrong: number;
  total_items: number;
  overall_score_percent: number;
  modules: TeacherModuleSummary[];
  top_improvement_areas: TeacherImprovementAreaItem[];
};

export type RegistrationPayload = {
  first_name: string;
  middle_name?: string;
  last_name: string;
  birth_date: string;
  address: string;
  email: string;
  phone_number: string;
  reference_number: string;
  reference_image: File;
};

export type RegistrationRecord = {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  address: string | null;
  email: string;
  phone_number: string;
  reference_number: string;
  reference_image_path: string | null;
  status: string;
  validated_at: string | null;
  validated_by: string | null;
  linked_user_id: number | null;
  issued_username: string | null;
  enrollment_id: number | null;
  payment_review_status: string | null;
  notes: string | null;
  created_at: string;
};

export type RegistrationSubmitResponse = {
  message: string;
  registration: RegistrationRecord;
};

export type ProfileUpdatePayload = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
  birth_date?: string | null;
};

export type ProgressSummary = {
  completed_modules: number;
  total_modules: number;
  overall_progress_percent: number;
};

export type LessonReference = {
  id: string;
  title: string;
  image_url: string;
  source_url: string;
  credit?: string;
  license?: string;
  letters?: string[];
};

export type Lesson = {
  id: string;
  title: string;
  content: string;
  references?: LessonReference[];
};

export type Assessment = {
  id: string;
  question: string;
  choices: string[];
  answer: string;
};

export type ModuleActivity = {
  id: number;
  activity_key: string;
  title: string;
  activity_type: string;
  order_index: number;
  instructions: string | null;
  definition: Record<string, unknown>;
  is_published: boolean;
};

export type ModuleItem = {
  id: number;
  slug: string;
  title: string;
  description: string;
  order_index: number;
  lessons: Lesson[];
  assessments: Assessment[];
  activities: ModuleActivity[];
  is_locked: boolean;
  is_published: boolean;
  status: "not_started" | "in_progress" | "completed";
  progress_percent: number;
  assessment_score: number | null;
};

export type TeacherAssessmentReport = {
  id: number;
  student_id: number;
  module_id: number;
  module_title: string;
  assessment_id: string;
  assessment_title: string;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas: string[];
  status: string;
  created_at: string;
};

export type TeacherBatch = {
  id: number;
  code: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  notes: string | null;
  student_count: number;
  created_at: string | null;
};

export type TeacherUserSummary = {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
};

export type TeacherStudentModuleProgress = {
  module_id: number;
  module_title: string;
  status: string;
  progress_percent: number;
  assessment_score: number | null;
  updated_at: string;
};

export type TeacherStudent = {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  address: string | null;
  birth_date: string | null;
  role: string;
  enrollment_status: string | null;
  batch: TeacherBatch | null;
  module_progress: TeacherStudentModuleProgress[];
};

export type TeacherEnrollment = {
  id: number;
  status: string;
  payment_review_status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  registration: RegistrationRecord;
  batch: TeacherBatch | null;
  student: TeacherUserSummary | null;
};

export type TeacherEnrollmentApprovalResult = {
  enrollment: TeacherEnrollment;
  issued_username: string;
  temporary_password: string;
  delivery_status: "sent" | "skipped";
  delivery_message: string;
  recipient_email: string;
};

export type TeacherEnrollmentApprovePayload = {
  batch_id?: number | null;
  batch_code?: string | null;
  batch_name?: string | null;
  issued_username?: string | null;
  temporary_password?: string | null;
  notes?: string | null;
  send_email?: boolean;
};

export type TeacherEnrollmentRejectPayload = {
  notes: string;
};

export type TeacherBatchCreatePayload = {
  code: string;
  name: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  capacity?: number | null;
  notes?: string | null;
};

export type TeacherActivityAttemptItem = {
  id: number;
  item_key: string;
  prompt: string | null;
  expected_answer: string | null;
  student_answer: string | null;
  is_correct: boolean | null;
  confidence: number | null;
  ai_metadata: Record<string, unknown>;
};

export type TeacherActivityAttempt = {
  id: number;
  student_id: number;
  student_name: string;
  module_id: number;
  module_title: string;
  activity_id: number;
  activity_key: string;
  activity_title: string;
  activity_type: string;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas: string[];
  ai_metadata: Record<string, unknown>;
  submitted_at: string;
  items: TeacherActivityAttemptItem[];
};

export type TeacherWeakItem = {
  module_id: number;
  module_title: string;
  activity_key: string;
  activity_title: string;
  item_key: string;
  prompt: string | null;
  expected_answer: string | null;
  wrong_count: number;
  attempt_count: number;
  wrong_rate_percent: number;
};

export type TeacherAttentionStudent = {
  student_id: number;
  student_name: string;
  student_email: string | null;
  batch_id: number | null;
  batch_name: string | null;
  attempt_count: number;
  average_score_percent: number;
  low_score_count: number;
  latest_attempt_at: string;
};

export type TeacherConcernAttempt = {
  attempt_id: number;
  student_id: number;
  student_name: string;
  batch_id: number | null;
  batch_name: string | null;
  module_id: number;
  module_title: string;
  activity_key: string;
  activity_title: string;
  score_percent: number;
  low_confidence_item_count: number;
  submitted_at: string;
};

export type TeacherReportSummary = {
  batch_id: number | null;
  module_id: number | null;
  total_students: number;
  total_attempts: number;
  average_score_percent: number;
  weak_items: TeacherWeakItem[];
  students_needing_attention: TeacherAttentionStudent[];
  recent_concern_attempts: TeacherConcernAttempt[];
};

export type ActivityAttemptItemPayload = {
  item_key: string;
  prompt?: string | null;
  expected_answer?: string | null;
  student_answer?: string | null;
  is_correct?: boolean | null;
  confidence?: number | null;
  ai_metadata?: Record<string, unknown>;
};

export type ActivityAttemptPayload = {
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas?: string[];
  ai_metadata?: Record<string, unknown>;
  source?: string;
  notes?: string | null;
  items?: ActivityAttemptItemPayload[];
  completed_lesson_id?: string | null;
  mark_module_completed?: boolean;
};

export type ActivityAttemptResponse = {
  id: number;
  module_id: number;
  module_activity_id: number;
  activity_key: string;
  activity_title: string;
  activity_type: string;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas: string[];
  ai_metadata: Record<string, unknown>;
  source: string;
  items: TeacherActivityAttemptItem[];
  progress: ModuleItem;
};

export type LabPrediction = {
  prediction: string;
  confidence: number;
  top_candidates: string[];
};

export type OpenPalmDetection = {
  open_palm: boolean;
};

export type RecognitionMode = "alphabet" | "numbers" | "words";
export type NumbersCategory =
  | "0-10"
  | "11-20"
  | "21-30"
  | "31-40"
  | "41-50"
  | "51-60"
  | "61-70"
  | "71-80"
  | "81-90"
  | "91-100";
export type WordsCategory =
  | "greeting"
  | "responses"
  | "date"
  | "family"
  | "relationship"
  | "color";

export type AlphabetDatasetStatus = {
  datasets_root: string;
  kaggle_zip_found: boolean;
  kaggle_zip_valid: boolean;
  kaggle_zip_error: string | null;
  kaggle_zip_path: string;
  kaggle_collated_found: boolean;
  kaggle_collated_path: string;
  kaggle_classes: string[];
  kaggle_total_images: number;
  github_model_found: boolean;
  github_scaler_found: boolean;
  github_model_path: string;
  github_scaler_path: string;
  supported_labels: string[];
  ready_for_alphabet_mode: boolean;
};

export type AlphabetModelStatus = {
  model_found: boolean;
  model_path: string;
  classes: string[];
  confidence_threshold: number;
  min_top2_margin: number;
  ready: boolean;
};

export type NumbersDatasetStatus = {
  dataset_path: string;
  dataset_found: boolean;
  class_labels: string[];
  class_counts: Record<string, number>;
  missing_labels: string[];
  total_images: number;
  ready_for_training: boolean;
};

export type NumbersModelStatus = {
  model_found: boolean;
  model_path: string;
  classes: string[];
  confidence_threshold: number;
  min_top2_margin: number;
  ten_motion_model_found: boolean;
  ten_motion_model_path: string;
  ten_motion_ready: boolean;
  supports_ten_dynamic: boolean;
  ten_sequence_frames: number;
  ten_min_sequence_frames: number;
  motion_model_found: boolean;
  motion_model_path: string;
  motion_ready: boolean;
  supports_11_100_dynamic: boolean;
  motion_sequence_frames: number;
  motion_min_sequence_frames: number;
  ready: boolean;
};

export type WordsDatasetStatus = {
  dataset_root: string;
  processed_path: string;
  clips_root: string;
  train_rows: number;
  test_rows: number;
  train_clips_found: number;
  test_clips_found: number;
  missing_train_clips: number;
  missing_test_clips: number;
  available_labels: string[];
  available_label_count: number;
  available_category_count: number;
  excluded_categories: string[];
  ready_for_training: boolean;
};

export type WordsModelStatus = {
  model_found: boolean;
  model_path: string;
  classes: string[];
  confidence_threshold: number;
  min_top2_margin: number;
  force_best_prediction: boolean;
  sequence_frames: number;
  min_sequence_frames: number;
  ready: boolean;
};

type TeacherAssessmentReportsResponse = {
  reports: TeacherAssessmentReport[];
};

async function performRequest(path: string, options?: RequestInit, token?: string): Promise<Response> {
  const apiBase = resolveApiBase();
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const authToken = token ?? getStoredToken();
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown network error";
    throw new Error(
      `Unable to reach API at ${apiBase}. ${reason}. Make sure the backend server is running and NEXT_PUBLIC_API_BASE_URL is correct.`
    );
  }

  if (!response.ok) {
    const fallback = "Request failed";
    let detail = fallback;
    try {
      const data = (await response.json()) as { detail?: string; message?: string };
      detail = data.detail ?? data.message ?? fallback;
    } catch {
      try {
        detail = (await response.text()) || fallback;
      } catch {}
    }
    throw new Error(detail);
  }

  return response;
}

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const response = await performRequest(path, options, token);
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function requestBlob(path: string, options?: RequestInit, token?: string): Promise<Blob> {
  const response = await performRequest(path, options, token);
  return response.blob();
}

export function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function requestForgotPasswordOtp(
  usernameOrEmail: string
): Promise<ForgotPasswordRequestResponse> {
  return request<ForgotPasswordRequestResponse>("/auth/forgot-password/request", {
    method: "POST",
    body: JSON.stringify({ username_or_email: usernameOrEmail }),
  });
}

export function verifyForgotPasswordOtp(
  usernameOrEmail: string,
  otpCode: string,
  newPassword: string
): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/forgot-password/verify", {
    method: "POST",
    body: JSON.stringify({
      username_or_email: usernameOrEmail,
      otp_code: otpCode,
      new_password: newPassword,
    }),
  });
}

export function verifyTeacherInviteQr(qrPayload: string): Promise<TeacherInviteVerifyQrResponse> {
  return request<TeacherInviteVerifyQrResponse>("/auth/teacher-invite/verify-qr", {
    method: "POST",
    body: JSON.stringify({ qr_payload: qrPayload }),
  });
}

export function verifyTeacherInvitePasskey(
  inviteCode: string,
  passkey: string
): Promise<TeacherInviteVerifyPasskeyResponse> {
  return request<TeacherInviteVerifyPasskeyResponse>("/auth/teacher-invite/verify-passkey", {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode, passkey }),
  });
}

export function issueTeacherCredentials(
  onboardingToken: string,
  email: string
): Promise<TeacherInviteIssueCredentialsResponse> {
  return request<TeacherInviteIssueCredentialsResponse>("/auth/teacher-invite/issue-credentials", {
    method: "POST",
    body: JSON.stringify({ onboarding_token: onboardingToken, email }),
  });
}

export function getCurrentUser(token: string): Promise<ApiUser> {
  return request<ApiUser>("/auth/me", undefined, token);
}

export function updateMyProfile(payload: ProfileUpdatePayload): Promise<ApiUser> {
  return request<ApiUser>("/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/me/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export function uploadMyProfilePhoto(file: File): Promise<ApiUser> {
  const data = new FormData();
  data.append("profile_photo", file);
  return request<ApiUser>("/auth/me/profile-photo", {
    method: "POST",
    body: data,
  });
}

export async function submitRegistration(
  payload: RegistrationPayload
): Promise<RegistrationSubmitResponse> {
  const data = new FormData();
  data.append("first_name", payload.first_name);
  data.append("last_name", payload.last_name);
  data.append("email", payload.email);
  data.append("phone_number", payload.phone_number);
  data.append("reference_number", payload.reference_number);

  if (payload.middle_name?.trim()) {
    data.append("middle_name", payload.middle_name.trim());
  }
  data.append("birth_date", payload.birth_date.trim());
  data.append("address", payload.address.trim());
  data.append("reference_image", payload.reference_image);

  return request<RegistrationSubmitResponse>("/registrations", {
    method: "POST",
    body: data,
  });
}

export function getProgressSummary(token?: string): Promise<ProgressSummary> {
  return request<ProgressSummary>("/progress/summary", undefined, token);
}

export function getModules(token?: string): Promise<ModuleItem[]> {
  return request<ModuleItem[]>("/modules", undefined, token);
}

export function getModule(moduleId: number, token?: string): Promise<ModuleItem> {
  return request<ModuleItem>(`/modules/${moduleId}`, undefined, token);
}

export function submitActivityAttempt(
  moduleId: number,
  activityKey: string | number,
  payload: ActivityAttemptPayload,
  token?: string
): Promise<ActivityAttemptResponse> {
  return request<ActivityAttemptResponse>(
    `/modules/${moduleId}/activities/${activityKey}/attempts`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function getTeacherAssessmentReports(
  token?: string
): Promise<TeacherAssessmentReport[]> {
  const data = await request<TeacherAssessmentReportsResponse>(
    "/teacher/reports",
    undefined,
    token
  );
  return data.reports;
}

export async function getTeacherStudentReportRows(
  token?: string
): Promise<TeacherStudentReportRow[]> {
  const data = await request<TeacherStudentReportTableResponse>(
    "/teacher/reports/students",
    undefined,
    token
  );
  return data.students;
}

export function generateTeacherStudentReport(
  studentId: number,
  token?: string
): Promise<TeacherGeneratedStudentReport> {
  return request<TeacherGeneratedStudentReport>(
    `/teacher/reports/students/${studentId}/generate`,
    {
      method: "POST",
    },
    token
  );
}

export function getTeacherReportSummary(
  filters?: { batchId?: number | null; moduleId?: number | null },
  token?: string
): Promise<TeacherReportSummary> {
  const query = buildQuery({
    batch_id: filters?.batchId,
    module_id: filters?.moduleId,
  });
  return request<TeacherReportSummary>(`/teacher/reports/summary${query}`, undefined, token);
}

export function getTeacherEnrollments(
  filters?: { status?: string | null; batchId?: number | null },
  token?: string
): Promise<TeacherEnrollment[]> {
  const query = buildQuery({
    status: filters?.status,
    batch_id: filters?.batchId,
  });
  return request<TeacherEnrollment[]>(`/teacher/enrollments${query}`, undefined, token);
}

export function getTeacherEnrollment(
  enrollmentId: number,
  token?: string
): Promise<TeacherEnrollment> {
  return request<TeacherEnrollment>(`/teacher/enrollments/${enrollmentId}`, undefined, token);
}

export function getTeacherEnrollmentPaymentProof(
  enrollmentId: number,
  token?: string
): Promise<Blob> {
  return requestBlob(`/teacher/enrollments/${enrollmentId}/payment-proof`, undefined, token);
}

export function approveTeacherEnrollment(
  enrollmentId: number,
  payload: TeacherEnrollmentApprovePayload,
  token?: string
): Promise<TeacherEnrollmentApprovalResult> {
  return request<TeacherEnrollmentApprovalResult>(
    `/teacher/enrollments/${enrollmentId}/approve`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function rejectTeacherEnrollment(
  enrollmentId: number,
  payload: TeacherEnrollmentRejectPayload,
  token?: string
): Promise<TeacherEnrollment> {
  return request<TeacherEnrollment>(
    `/teacher/enrollments/${enrollmentId}/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherBatches(token?: string): Promise<TeacherBatch[]> {
  return request<TeacherBatch[]>("/teacher/batches", undefined, token);
}

export function createTeacherBatch(
  payload: TeacherBatchCreatePayload,
  token?: string
): Promise<TeacherBatch> {
  return request<TeacherBatch>(
    "/teacher/batches",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherBatchStudents(
  batchId: number,
  token?: string
): Promise<TeacherUserSummary[]> {
  return request<TeacherUserSummary[]>(`/teacher/batches/${batchId}/students`, undefined, token);
}

export function getTeacherStudent(studentId: number, token?: string): Promise<TeacherStudent> {
  return request<TeacherStudent>(`/teacher/students/${studentId}`, undefined, token);
}

export function getTeacherStudentActivityAttempts(
  studentId: number,
  token?: string
): Promise<TeacherActivityAttempt[]> {
  return request<TeacherActivityAttempt[]>(
    `/teacher/students/${studentId}/activity-attempts`,
    undefined,
    token
  );
}

export function getTeacherActivityAttempt(
  attemptId: number,
  token?: string
): Promise<TeacherActivityAttempt> {
  return request<TeacherActivityAttempt>(`/teacher/activity-attempts/${attemptId}`, undefined, token);
}

export function updateModuleProgress(
  moduleId: number,
  payload: {
    completed_lesson_id?: string;
    assessment_id?: string;
    assessment_score?: number;
    assessment_right?: number;
    assessment_wrong?: number;
    assessment_total?: number;
    assessment_title?: string;
    improvement_areas?: string[];
    mark_completed?: boolean;
  },
  token?: string
): Promise<ModuleItem> {
  return request<ModuleItem>(
    `/modules/${moduleId}/progress`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherReportStudents(token?: string): Promise<TeacherStudentReportTableResponse> {
  return request<TeacherStudentReportTableResponse>("/teacher/reports/students", undefined, token);
}

export function predictSign(
  payload: { frame_count: number; metadata?: Record<string, string> },
  token?: string
): Promise<LabPrediction> {
  return request<LabPrediction>(
    "/lab/predict",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function predictSignFromImage(
  file: File,
  mode: RecognitionMode = "alphabet",
  token?: string
): Promise<LabPrediction> {
  const data = new FormData();
  data.append("image", file);
  data.append("mode", mode);

  return request<LabPrediction>(
    "/lab/predict-image",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function detectOpenPalmFromImage(file: File, token?: string): Promise<OpenPalmDetection> {
  const data = new FormData();
  data.append("image", file);

  return request<OpenPalmDetection>(
    "/lab/detect-open-palm",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function predictWordsFromFrames(
  frames: File[],
  token?: string,
  wordGroup: WordsCategory = "greeting"
): Promise<LabPrediction> {
  const data = new FormData();
  for (const frame of frames) {
    data.append("frames", frame);
  }
  data.append("word_group", wordGroup);

  return request<LabPrediction>(
    "/lab/predict-words-sequence",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function predictNumbersFromFrames(
  frames: File[],
  token?: string,
  numberGroup: NumbersCategory = "0-10"
): Promise<LabPrediction> {
  const data = new FormData();
  for (const frame of frames) {
    data.append("frames", frame);
  }
  data.append("number_group", numberGroup);

  return request<LabPrediction>(
    "/lab/predict-numbers-sequence",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function getAlphabetDatasetStatus(token?: string): Promise<AlphabetDatasetStatus> {
  return request<AlphabetDatasetStatus>("/lab/alphabet-dataset", undefined, token);
}

export function getAlphabetModelStatus(token?: string): Promise<AlphabetModelStatus> {
  return request<AlphabetModelStatus>("/lab/alphabet-model", undefined, token);
}

export function getNumbersDatasetStatus(token?: string): Promise<NumbersDatasetStatus> {
  return request<NumbersDatasetStatus>("/lab/numbers-dataset", undefined, token);
}

export function getNumbersModelStatus(token?: string): Promise<NumbersModelStatus> {
  return request<NumbersModelStatus>("/lab/numbers-model", undefined, token);
}

export function getWordsDatasetStatus(token?: string): Promise<WordsDatasetStatus> {
  return request<WordsDatasetStatus>("/lab/words-dataset", undefined, token);
}

export function getWordsModelStatus(token?: string): Promise<WordsModelStatus> {
  return request<WordsModelStatus>("/lab/words-model", undefined, token);
}
