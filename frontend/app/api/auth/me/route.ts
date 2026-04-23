import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  clearSessionCookies,
  fetchBackendUser,
  guestSessionUser,
} from "@/lib/auth-session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("fsl_token")?.value;

  if (!token) {
    return NextResponse.json(guestSessionUser());
  }

  const user = await fetchBackendUser(token);
  if (user) {
    return NextResponse.json(user);
  }

  const response = NextResponse.json(guestSessionUser());
  clearSessionCookies(response);
  return response;
}
