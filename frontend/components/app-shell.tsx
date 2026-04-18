"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth-context";
import { AppNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { resolveUploadsBase } from "@/lib/api";

function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/register");
}

type AppToastKind = "success" | "error" | "info";

type AppToast = {
  id: number;
  message: string;
  kind: AppToastKind;
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { displayName, id, loading, logout, mustChangePassword, profileImagePath, role } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [showRouteOverlay, setShowRouteOverlay] = useState(false);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const routeLoadingStartedAtRef = useRef<number | null>(null);
  const routeOverlayTimerRef = useRef<number | null>(null);
  const routeStopTimerRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef("");
  const nextToastIdRef = useRef(1);
  const toastTimersRef = useRef<Map<number, number>>(new Map());

  const publicRoute = useMemo(() => isPublicRoute(pathname), [pathname]);
  const routeKey = pathname;
  const homeHref = role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/dashboard";
  const headerGreeting =
    role === "admin" ? (
      <>
        Welcome, Admin <span className="text-brandBlue">{displayName}</span>
      </>
    ) : role === "teacher" ? (
      <>
        Welcome, Teacher <span className="text-brandBlue">{displayName}</span>
      </>
    ) : (
      <>
        Welcome, <span className="text-brandBlue">{displayName}</span>
      </>
    );
  const profileImageUrl = useMemo(() => {
    if (!profileImagePath) {
      return null;
    }
    const uploadBase = resolveUploadsBase();
    return `${uploadBase}/${profileImagePath}`;
  }, [profileImagePath]);

  function startRouteLoading() {
    if (routeOverlayTimerRef.current !== null) {
      window.clearTimeout(routeOverlayTimerRef.current);
    }
    if (routeStopTimerRef.current !== null) {
      window.clearTimeout(routeStopTimerRef.current);
      routeStopTimerRef.current = null;
    }
    if (!isRouteLoading) {
      routeLoadingStartedAtRef.current = Date.now();
      setIsRouteLoading(true);
    }
    routeOverlayTimerRef.current = window.setTimeout(() => {
      setShowRouteOverlay(true);
    }, 420);
  }

  function stopRouteLoading() {
    if (routeOverlayTimerRef.current !== null) {
      window.clearTimeout(routeOverlayTimerRef.current);
      routeOverlayTimerRef.current = null;
    }
    const startedAt = routeLoadingStartedAtRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const minimumVisibleMs = 180;
    const delay = Math.max(0, minimumVisibleMs - elapsed);

    if (routeStopTimerRef.current !== null) {
      window.clearTimeout(routeStopTimerRef.current);
    }

    routeStopTimerRef.current = window.setTimeout(() => {
      setShowRouteOverlay(false);
      setIsRouteLoading(false);
      routeLoadingStartedAtRef.current = null;
      routeStopTimerRef.current = null;
    }, delay);
  }

  useEffect(() => {
    if (loading) {
      return;
    }
    if (publicRoute) {
      if (pathname === "/" && id !== 0) {
        router.replace(homeHref);
      }
      return;
    }
    if (id === 0) {
      router.replace("/");
      return;
    }
    if (mustChangePassword && pathname !== "/profile") {
      router.replace("/profile?forcePasswordChange=1");
    }
  }, [homeHref, id, loading, mustChangePassword, pathname, publicRoute, router]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!lastRouteKeyRef.current) {
      lastRouteKeyRef.current = routeKey;
      return;
    }
    if (lastRouteKeyRef.current !== routeKey) {
      lastRouteKeyRef.current = routeKey;
      stopRouteLoading();
    }
  }, [routeKey]);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 220);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    function shouldTrackNavigation(link: HTMLAnchorElement): boolean {
      const href = link.getAttribute("href");
      if (!href) {
        return false;
      }
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return false;
      }
      if (link.target && link.target !== "_self") {
        return false;
      }
      if (link.hasAttribute("download")) {
        return false;
      }
      const targetUrl = new URL(link.href, window.location.href);
      if (targetUrl.origin !== window.location.origin) {
        return false;
      }
      const currentPath = `${window.location.pathname}${window.location.search}`;
      const nextPath = `${targetUrl.pathname}${targetUrl.search}`;
      return nextPath !== currentPath;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target as Element | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || !shouldTrackNavigation(link)) {
        return;
      }
      startRouteLoading();
    }

    function handlePopState() {
      startRouteLoading();
    }

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isRouteLoading]);

  useEffect(() => {
    let lastOpenModal: Element | null = null;

    function findOpenModal(): Element | null {
      return (
        document.querySelector(".modal.show .modal-dialog") ??
        document.querySelector("[aria-modal='true'] .modal-dialog") ??
        document.querySelector("[aria-modal='true']") ??
        null
      );
    }

    function bringModalIntoView() {
      const modalTarget = findOpenModal();
      if (!modalTarget) {
        lastOpenModal = null;
        return;
      }
      if (modalTarget === lastOpenModal) {
        return;
      }
      lastOpenModal = modalTarget;
      modalTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      if (modalTarget instanceof HTMLElement) {
        if (!modalTarget.hasAttribute("tabindex")) {
          modalTarget.setAttribute("tabindex", "-1");
        }
        window.setTimeout(() => {
          modalTarget.focus({ preventScroll: true });
        }, 140);
      }
    }

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(bringModalIntoView);
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden", "aria-modal"],
    });

    bringModalIntoView();
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (!userMenuRef.current) {
        return;
      }
      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    function handleToast(event: Event) {
      const customEvent = event as CustomEvent<{ message?: string; kind?: AppToastKind; durationMs?: number }>;
      const message = customEvent.detail?.message?.trim();
      if (!message) {
        return;
      }
      const kind: AppToastKind = customEvent.detail?.kind ?? "success";
      const durationMs =
        typeof customEvent.detail?.durationMs === "number" && customEvent.detail.durationMs > 0
          ? customEvent.detail.durationMs
          : 2800;
      const id = nextToastIdRef.current++;
      setToasts((current) => [...current, { id, message, kind }]);
      const timerId = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        toastTimersRef.current.delete(id);
      }, durationMs);
      toastTimersRef.current.set(id, timerId);
    }

    window.addEventListener("app:toast", handleToast as EventListener);
    return () => {
      window.removeEventListener("app:toast", handleToast as EventListener);
      toastTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      toastTimersRef.current.clear();
      if (routeOverlayTimerRef.current !== null) {
        window.clearTimeout(routeOverlayTimerRef.current);
      }
      if (routeStopTimerRef.current !== null) {
        window.clearTimeout(routeStopTimerRef.current);
      }
    };
  }, []);

  if (
    (!publicRoute && loading) ||
    (publicRoute && pathname === "/" && id !== 0) ||
    (!publicRoute && id === 0) ||
    (!publicRoute && mustChangePassword && pathname !== "/profile")
  ) {
    return <div className="min-h-screen bg-grid" />;
  }

  if (publicRoute) {
    return (
      <div className="min-h-screen bg-grid">
        <header className="sticky top-0 z-[120] overflow-visible border-b border-brandBorder bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 overflow-visible">
            <Image
              alt="Hand & Heart"
              className="h-10 w-10 rounded-full"
              height={40}
              src="/brand/logo.png"
              width={40}
            />
            <div>
              <p className="text-xl font-bold text-slate-900 md:text-2xl">FSL Learning Hub</p>
              <p className="text-sm text-muted">Hand &amp; Heart</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
          <div className="page-transition-enter" key={routeKey}>
            {children}
          </div>
        </main>
        <SiteFooter variant="bar" />
        {showScrollTop ? (
          <button
            aria-label="Scroll to top"
            className="fixed bottom-5 right-4 z-[250] inline-flex h-11 w-11 items-center justify-center rounded-full border border-brandBlue/35 bg-brandBlue text-lg font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-brandBlue/90 md:bottom-6 md:right-6"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            type="button"
          >
            ↑
          </button>
        ) : null}
        {isRouteLoading ? <div aria-hidden="true" className="app-route-progress" /> : null}
        {showRouteOverlay ? (
          <div className="app-route-overlay" role="status" aria-live="polite">
            <div className="app-route-overlay-card">
              <div className="spinner-border text-primary" role="presentation" />
              <p className="mb-0 mt-2 text-sm fw-semibold text-slate-700">Loading page...</p>
            </div>
          </div>
        ) : null}
        <div className="app-toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div className={`app-toast app-toast-${toast.kind}`} key={toast.id} role="status">
              <p className="mb-0 text-sm fw-semibold">{toast.message}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid md:flex">
      <AppNav role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-[var(--teacher-shell-mobile-nav-offset)] z-[120] overflow-visible border-b border-brandBorder bg-white/95 px-4 py-3 backdrop-blur-md md:top-0 md:px-8">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 overflow-visible">
            <div className="flex items-center gap-3">
              <button
                className="inline-flex h-9 items-center rounded-lg border border-brandBorder bg-brandMutedSurface px-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                onClick={() => {
                  startRouteLoading();
                  if (window.history.length > 1) {
                    router.back();
                    return;
                  }
                  router.push(homeHref);
                }}
                type="button"
              >
                Back
              </button>

              <div className="text-sm font-semibold text-slate-700">
                {headerGreeting}
              </div>
            </div>

            <div className="relative overflow-visible" ref={userMenuRef}>
              <button
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brandBorder bg-white transition hover:bg-brandBlueLight"
                onClick={() => setUserMenuOpen((open) => !open)}
                type="button"
              >
                {profileImageUrl ? (
                  <img
                    alt="Profile"
                    className="h-9 w-9 rounded-full object-cover"
                    src={profileImageUrl}
                  />
                ) : (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brandBlue text-sm font-bold text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </button>

              {userMenuOpen ? (
                <div className="absolute right-0 z-[200] mt-2 w-44 rounded-xl border border-brandBorder bg-white p-1 shadow-lg">
                  <Link
                    className="block rounded-lg px-3 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                    href="/profile"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <button
                    className="mt-1 w-full rounded-lg bg-brandRed px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-brandRed/90"
                    onClick={() => {
                      startRouteLoading();
                      void logout().finally(() => {
                        router.replace("/");
                      });
                    }}
                    type="button"
                  >
                    Log Out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="relative z-0 w-full flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <div className="page-transition-enter" key={routeKey}>
              {children}
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
      {showScrollTop ? (
        <button
          aria-label="Scroll to top"
          className="fixed bottom-5 right-4 z-[250] inline-flex h-11 w-11 items-center justify-center rounded-full border border-brandBlue/35 bg-brandBlue text-lg font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-brandBlue/90 md:bottom-6 md:right-6"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          type="button"
        >
          ↑
        </button>
      ) : null}
      {isRouteLoading ? <div aria-hidden="true" className="app-route-progress" /> : null}
      {showRouteOverlay ? (
        <div className="app-route-overlay" role="status" aria-live="polite">
          <div className="app-route-overlay-card">
            <div className="spinner-border text-primary" role="presentation" />
            <p className="mb-0 mt-2 text-sm fw-semibold text-slate-700">Loading page...</p>
          </div>
        </div>
      ) : null}
      <div className="app-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className={`app-toast app-toast-${toast.kind}`} key={toast.id} role="status">
            <p className="mb-0 text-sm fw-semibold">{toast.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
