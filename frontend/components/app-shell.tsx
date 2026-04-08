"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-context";
import { AppNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { getUploadBase } from "@/lib/api-base";

function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/register");
}

function isTeacherRoute(pathname: string): boolean {
  return pathname === "/teacher" || pathname.startsWith("/teacher/");
}

function isProfileRoute(pathname: string): boolean {
  return pathname === "/profile";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { displayName, loading, logout, profileImagePath, role, username } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const publicRoute = useMemo(() => isPublicRoute(pathname), [pathname]);
  const teacherRoute = useMemo(() => isTeacherRoute(pathname), [pathname]);
  const profileRoute = useMemo(() => isProfileRoute(pathname), [pathname]);
  const isGuest = username === "Guest";
  const profileImageUrl = useMemo(() => {
    if (!profileImagePath) {
      return null;
    }

    return `${getUploadBase()}/${profileImagePath}`;
  }, [profileImagePath]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (publicRoute && !isGuest) {
      router.replace(role === "teacher" ? "/teacher" : "/dashboard");
      return;
    }

    if (teacherRoute && role !== "teacher") {
      router.replace("/dashboard");
      return;
    }

    if (profileRoute && isGuest) {
      router.replace("/");
    }
  }, [isGuest, loading, profileRoute, publicRoute, role, router, teacherRoute]);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-grid" />;
  }

  if (publicRoute) {
    return (
      <div className="min-h-screen bg-grid">
        <header className="border-b border-brandBorder bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
            <Image
              alt="Hand & Heart"
              className="h-10 w-10 rounded-full"
              height={40}
              src="/brand/logo.png"
              width={40}
            />
            <div>
              <p className="text-xl font-bold text-slate-900 md:text-2xl">FSL Learning Hub</p>
              <p className="text-sm text-muted">Hand &amp; Heart Learning Portal</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
          <div className="page-transition-enter" key={pathname}>
            {children}
          </div>
        </main>
        <SiteFooter variant="bar" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid md:flex">
      {teacherRoute ? null : <AppNav />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-brandBorder bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                className="inline-flex h-9 items-center rounded-lg border border-brandBorder bg-brandMutedSurface px-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                onClick={() => {
                  if (window.history.length > 1) {
                    router.back();
                    return;
                  }
                  router.push(teacherRoute ? "/teacher" : "/dashboard");
                }}
                type="button"
              >
                Back
              </button>

              <div className="text-sm font-semibold text-slate-700">
                Welcome, <span className="text-brandBlue">{displayName}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isGuest ? (
                <Link
                  className="inline-flex h-9 items-center rounded-lg bg-brandBlue px-3 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
                  href="/"
                >
                  Log In
                </Link>
              ) : (
                <>
                  <Link
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-brandBorder bg-brandBlueLight px-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight/70"
                    href="/profile"
                  >
                    {profileImageUrl ? (
                      <img
                        alt="Profile"
                        className="h-6 w-6 rounded-full border border-brandBorder object-cover"
                        src={profileImageUrl}
                      />
                    ) : (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brandBlue text-xs font-bold text-white">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    Profile
                  </Link>

                  <button
                    className="h-9 rounded-lg bg-brandRed px-3 text-sm font-semibold text-white transition hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={signingOut}
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    {signingOut ? "Logging Out..." : "Log Out"}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="w-full flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <div className="page-transition-enter" key={pathname}>
              {children}
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
