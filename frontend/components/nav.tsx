"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", short: "D" },
  { href: "/modules", label: "Modules", short: "M" },
  { href: "/lab", label: "Free Signing Gesture", short: "F" }
] as const;

export function AppNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-brandWhite/20 bg-panel/95 px-4 py-3 md:hidden">
        <button
          className="rounded border border-brandWhite/30 px-3 py-1 text-xs font-semibold text-brandWhite"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          Menu
        </button>
        <div className="flex items-center gap-2">
          <Image
            alt="FSL Learning Hub logo"
            className="h-8 w-8 rounded-full border border-brandWhite/30 object-cover"
            height={32}
            src="/brand/logo.png"
            width={32}
          />
          <span className="text-sm font-semibold text-brandWhite">FSL Learning Hub</span>
        </div>
      </div>

      {mobileOpen ? (
        <button
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 h-screen -translate-x-full transition-all duration-300 md:sticky md:translate-x-0 ${
          collapsed ? "md:w-20" : "md:w-72"
        } ${mobileOpen ? "translate-x-0 w-72" : "w-72"}`}
      >
        <div className="flex h-full flex-col border-r border-brandWhite/20 bg-panel/95 backdrop-blur">
          <div className="flex items-center gap-3 border-b border-brandWhite/20 p-4">
            <Image
              alt="FSL Learning Hub logo"
              className="h-10 w-10 rounded-full border border-brandWhite/30 object-cover"
              height={40}
              src="/brand/logo.png"
              width={40}
            />
            {!collapsed ? (
              <div className="min-w-0 md:block">
                <h1 className="truncate text-sm font-semibold tracking-wide text-brandWhite">FSL Learning Hub</h1>
                <p className="text-[11px] text-muted">Hand & Heart</p>
              </div>
            ) : null}

            <button
              className="ml-auto hidden rounded border border-brandWhite/30 px-2 py-1 text-xs font-semibold text-brandWhite md:block"
              onClick={() => setCollapsed((value) => !value)}
              type="button"
            >
              {collapsed ? ">" : "<"}
            </button>

            <button
              className="ml-auto rounded border border-brandWhite/30 px-2 py-1 text-xs font-semibold text-brandWhite md:hidden"
              onClick={() => setMobileOpen(false)}
              type="button"
            >
              X
            </button>
          </div>

          <nav className="flex-1 space-y-2 p-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-brandYellow bg-brandYellow/15 text-brandYellow"
                      : "border-brandWhite/15 text-brandWhite hover:border-brandWhite/40 hover:bg-black/20"
                  }`}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-current text-xs">
                    {item.short}
                  </span>
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
