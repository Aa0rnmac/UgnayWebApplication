"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type UserRole = "student" | "teacher";

type AuthUser = {
  username: string;
  role: UserRole;
};

type SessionState = {
  role: UserRole;
  username: string;
  loading: boolean;
};

type AuthState = SessionState & {
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const GUEST_STATE = {
  role: "student" as const,
  username: "Guest",
  loading: false,
};

const AuthContext = createContext<AuthState>({
  role: "student",
  username: "Guest",
  loading: true,
  login: async () => ({ role: "student", username: "Guest" }),
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ role: "student", username: "Guest", loading: true });

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to resolve current user");
        }
        const data = (await response.json()) as { username?: string; role?: string };
        if (!cancelled) {
          setState({
            role: data.role === "teacher" ? "teacher" : "student",
            username: data.username ?? "Guest",
            loading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState(GUEST_STATE);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(username: string, password: string): Promise<AuthUser> {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      detail?: string;
      user?: {
        username?: string;
        role?: string;
      };
    };

    if (!response.ok) {
      throw new Error(data.detail ?? "Unable to sign in.");
    }

    const nextUser = {
      username: data.user?.username ?? "Guest",
      role: data.user?.role === "teacher" ? "teacher" : "student",
    } as AuthUser;

    setState({
      ...nextUser,
      loading: false,
    });

    return nextUser;
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    setState({
      ...GUEST_STATE,
    });
  }

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
