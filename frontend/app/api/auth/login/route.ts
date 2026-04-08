import { NextResponse } from "next/server";

import { loginAgainstBackend, setSessionCookies } from "@/lib/auth-session";

type LoginRequest = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as LoginRequest;
  const username = payload.username?.trim();
  const password = payload.password?.trim();

  if (!username || !password) {
    return NextResponse.json(
      { detail: "Username and password are required." },
      { status: 400 }
    );
  }

  const result = await loginAgainstBackend(username, password);
  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status });
  }

  const response = NextResponse.json({ token: result.token, user: result.user });
  setSessionCookies(response, result.token);
  return response;
}
