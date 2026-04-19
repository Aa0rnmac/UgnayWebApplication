export type AppToastKind = "success" | "error" | "info";

export type AppToastPayload = {
  message: string;
  kind?: AppToastKind;
  durationMs?: number;
};

export function notifyApp(payload: AppToastPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!payload.message?.trim()) {
    return;
  }
  window.dispatchEvent(new CustomEvent<AppToastPayload>("app:toast", { detail: payload }));
}

export function notifySuccess(message: string, durationMs = 2800): void {
  notifyApp({ message, kind: "success", durationMs });
}

export function notifyError(message: string, durationMs = 4200): void {
  notifyApp({ message, kind: "error", durationMs });
}

export function notifyInfo(message: string, durationMs = 3000): void {
  notifyApp({ message, kind: "info", durationMs });
}
