const DEFAULT_API_BASE = "http://127.0.0.1:8000/api";
const DEFAULT_FETCH_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 700;

function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;
  return normalizeApiBase(configured);
}

export function getApiBaseCandidates(base = getApiBase()): string[] {
  const normalized = normalizeApiBase(base);
  const candidates = [normalized];

  if (normalized.includes("://localhost")) {
    candidates.push(normalized.replace("://localhost", "://127.0.0.1"));
  } else if (normalized.includes("://127.0.0.1")) {
    candidates.push(normalized.replace("://127.0.0.1", "://localhost"));
  }

  return [...new Set(candidates)];
}

export function getUploadBase(): string {
  return getApiBase().replace(/\/api$/, "");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchWithApiFallback(
  path: string,
  init?: RequestInit,
  options?: {
    attempts?: number;
    retryDelayMs?: number;
  }
): Promise<{ response: Response; usedBase: string }> {
  const candidates = getApiBaseCandidates();
  let lastError: unknown = null;
  const attempts = Math.max(1, options?.attempts ?? DEFAULT_FETCH_ATTEMPTS);
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const base of candidates) {
      try {
        const response = await fetch(`${base}${path}`, init);
        return { response, usedBase: base };
      } catch (error) {
        lastError = error;
      }
    }

    if (attempt < attempts - 1) {
      await sleep(retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown network error");
}
