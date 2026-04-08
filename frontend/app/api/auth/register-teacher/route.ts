import { NextResponse } from "next/server";

import {
  registerTeacherAgainstBackend,
  setSessionCookies,
} from "@/lib/auth-session";
import type { TeacherRegistrationRequest } from "@/lib/auth-session";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Partial<TeacherRegistrationRequest>;

  const result = await registerTeacherAgainstBackend({
    username: payload.username?.trim() ?? "",
    password: payload.password ?? "",
    passkey: payload.passkey?.trim() ?? "",
    first_name: payload.first_name?.trim() ?? "",
    middle_name: payload.middle_name?.trim() || undefined,
    last_name: payload.last_name?.trim() ?? "",
    email: payload.email?.trim() ?? "",
    phone_number: payload.phone_number?.trim() || undefined,
    address: payload.address?.trim() || undefined,
    birth_date: payload.birth_date?.trim() || undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status });
  }

  const response = NextResponse.json({ token: result.token, user: result.user });
  setSessionCookies(response, result.token);
  return response;
}
