import Link from "next/link";
import { ReactNode } from "react";

export type TeacherWorkspaceCardAppearance = "themed" | "default" | "attention";

const CARD_THEMES = [
  {
    shell: "bg-[#f41328]",
    border: "border-[#f2f2f2]",
    media: "from-[#ece51e] to-[#f7f3a3]",
    mediaCopy: "text-slate-950",
    copy: "text-white",
    muted: "text-white/80",
    button: "border-white/80 text-white hover:bg-white/10",
  },
  {
    shell: "bg-[#49b649]",
    border: "border-[#f2f2f2]",
    media: "from-[#f2f2f2] to-[#dae5ef]",
    mediaCopy: "text-slate-950",
    copy: "text-white",
    muted: "text-white/80",
    button: "border-white/80 text-white hover:bg-white/10",
  },
  {
    shell: "bg-[#ece51e]",
    border: "border-[#f2f2f2]",
    media: "from-[#d7ddf3] to-[#4655a6]",
    mediaCopy: "text-slate-950",
    copy: "text-black",
    muted: "text-black/75",
    button: "border-black/50 text-black hover:bg-black/10",
  },
  {
    shell: "bg-[#4655a6]",
    border: "border-[#f2f2f2]",
    media: "from-[#f2f2f2] to-[#ece51e]",
    mediaCopy: "text-slate-950",
    copy: "text-white",
    muted: "text-white/80",
    button: "border-white/80 text-white hover:bg-white/10",
  },
] as const;

const DEFAULT_CARD_THEME = {
  shell: "bg-white",
  border: "border-[#d9e0ea]",
  media: "from-[#f7f9fc] via-[#eef3f8] to-[#e7edf5]",
  mediaCopy: "text-slate-900",
  copy: "text-slate-900",
  muted: "text-slate-600",
  button: "border-slate-300 text-slate-900 hover:bg-slate-100",
} as const;

const ATTENTION_CARD_THEME = {
  shell: "bg-[#f41328]",
  border: "border-[#f2f2f2]",
  media: "from-[#ece51e] to-[#f7f3a3]",
  mediaCopy: "text-slate-950",
  copy: "text-white",
  muted: "text-white/80",
  button: "border-white/80 text-white hover:bg-white/10",
} as const;

function getTheme(themeIndex: number, appearance: TeacherWorkspaceCardAppearance) {
  if (appearance === "default") {
    return DEFAULT_CARD_THEME;
  }
  if (appearance === "attention") {
    return ATTENTION_CARD_THEME;
  }
  return CARD_THEMES[themeIndex % CARD_THEMES.length];
}

function badgeDisplayClass(badge: string) {
  if (badge.length >= 10) {
    return "px-4 text-xl tracking-[0.08em] md:text-2xl";
  }
  if (badge.length >= 7) {
    return "px-4 text-2xl tracking-[0.12em] md:text-3xl";
  }
  return "text-4xl tracking-[0.2em]";
}

type TeacherWorkspaceCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  href?: string;
  ctaLabel?: string;
  themeIndex: number;
  mediaImageUrl?: string | null;
  metadataSlot?: ReactNode;
  footerSlot?: ReactNode;
  appearance?: TeacherWorkspaceCardAppearance;
};

export function TeacherWorkspaceCard({
  appearance = "themed",
  badge,
  ctaLabel,
  description,
  eyebrow,
  footerSlot,
  href,
  mediaImageUrl,
  metadataSlot,
  themeIndex,
  title,
}: TeacherWorkspaceCardProps) {
  const theme = getTheme(themeIndex, appearance);
  const useInlineActions = Boolean(footerSlot);

  const content = (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-[28px] border-2 p-4 shadow-soft transition hover:-translate-y-1 ${theme.shell} ${theme.border}`}
    >
      <div
        className={`relative h-40 overflow-hidden rounded-[22px] border-2 ${theme.border} bg-gradient-to-br ${theme.media}`}
      >
        {mediaImageUrl ? (
          <>
            <img
              alt={`${title} cover`}
              className="h-full w-full object-cover"
              src={mediaImageUrl}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 rounded-full bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-950 shadow-sm">
              {badge}
            </div>
          </>
        ) : (
          <div
            className={`flex h-full items-center justify-center text-center font-black uppercase ${badgeDisplayClass(badge)} ${theme.mediaCopy}`}
          >
            {badge}
          </div>
        )}
      </div>

      <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.28em] ${theme.muted}`}>{eyebrow}</p>
      <h3 className={`mt-2 text-3xl font-black leading-tight ${theme.copy}`}>{title}</h3>
      <p className={`mt-3 text-sm leading-relaxed ${theme.muted}`}>{description}</p>
      {metadataSlot ? <div className="mt-3">{metadataSlot}</div> : null}

      {ctaLabel || footerSlot ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {ctaLabel && href && useInlineActions ? (
            <Link
              className={`inline-flex rounded-full border px-3 py-2 text-xs font-semibold transition ${theme.button}`}
              href={href}
            >
              {ctaLabel}
            </Link>
          ) : ctaLabel ? (
            <span
              className={`inline-flex rounded-full border px-3 py-2 text-xs font-semibold transition ${theme.button}`}
            >
              {ctaLabel}
            </span>
          ) : null}
          {footerSlot}
        </div>
      ) : null}
    </article>
  );

  if (!href || useInlineActions) {
    return content;
  }

  return (
    <Link className="block h-full" href={href}>
      {content}
    </Link>
  );
}
