const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

function getStoredToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const token = window.localStorage.getItem("auth_token");
  return token && token.trim() ? token : undefined;
}

export type ApiUser = {
  id: number;
  username: string;
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

export type ModuleItem = {
  id: number;
  slug: string;
  title: string;
  description: string;
  order_index: number;
  lessons: Lesson[];
  assessments: Assessment[];
  is_locked: boolean;
  status: "in_progress" | "completed";
  progress_percent: number;
  assessment_score: number | null;
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

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const authToken = token ?? getStoredToken();
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      cache: "no-store"
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown network error";
    throw new Error(
      `Unable to reach API at ${API_BASE}. ${reason}. Make sure the backend server is running and NEXT_PUBLIC_API_BASE_URL is correct.`
    );
  }

  if (!response.ok) {
    const fallback = "Request failed";
    let detail = fallback;
    try {
      const data = await response.json();
      detail = data.detail ?? data.message ?? fallback;
    } catch {}
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function requestForgotPasswordOtp(
  usernameOrEmail: string
): Promise<ForgotPasswordRequestResponse> {
  return request<ForgotPasswordRequestResponse>("/auth/forgot-password/request", {
    method: "POST",
    body: JSON.stringify({ username_or_email: usernameOrEmail })
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
      new_password: newPassword
    })
  });
}

export function getCurrentUser(token: string): Promise<ApiUser> {
  return request<ApiUser>("/auth/me", undefined, token);
}

export function updateMyProfile(payload: ProfileUpdatePayload): Promise<ApiUser> {
  return request<ApiUser>("/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload)
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
      new_password: newPassword
    })
  });
}

export function uploadMyProfilePhoto(file: File): Promise<ApiUser> {
  const data = new FormData();
  data.append("profile_photo", file);
  return request<ApiUser>("/auth/me/profile-photo", {
    method: "POST",
    body: data
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
    body: data
  });
}

export function getProgressSummary(token?: string): Promise<ProgressSummary> {
  return request<ProgressSummary>("/progress/summary", undefined, token);
}

export function getModules(token?: string): Promise<ModuleItem[]> {
  return request<ModuleItem[]>("/modules", undefined, token);
}

export function updateModuleProgress(
  moduleId: number,
  payload: {
    completed_lesson_id?: string;
    assessment_score?: number;
    mark_completed?: boolean;
  },
  token?: string
): Promise<ModuleItem> {
  return request<ModuleItem>(
    `/modules/${moduleId}/progress`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function predictSign(
  payload: { frame_count: number; metadata?: Record<string, string> },
  token?: string
): Promise<LabPrediction> {
  return request<LabPrediction>(
    "/lab/predict",
    {
      method: "POST",
      body: JSON.stringify(payload)
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
      body: data
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
      body: data
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
      body: data
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
      body: data
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
