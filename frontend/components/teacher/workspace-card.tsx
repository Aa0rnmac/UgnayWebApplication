import Link from "next/link";

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

function getTheme(themeIndex: number) {
  return CARD_THEMES[themeIndex % CARD_THEMES.length];
}

type TeacherWorkspaceCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  href?: string;
  ctaLabel?: string;
  themeIndex: number;
};

export function TeacherWorkspaceCard({
  badge,
  ctaLabel,
  description,
  eyebrow,
  href,
  themeIndex,
  title,
}: TeacherWorkspaceCardProps) {
  const theme = getTheme(themeIndex);

  const content = (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-[28px] border-2 p-4 shadow-soft transition hover:-translate-y-1 ${theme.shell} ${theme.border}`}
    >
      <div className={`h-40 rounded-[22px] border-2 ${theme.border} bg-gradient-to-br ${theme.media}`}>
        <div
          className={`flex h-full items-center justify-center text-4xl font-black tracking-[0.2em] ${theme.mediaCopy}`}
        >
          {badge}
        </div>
      </div>

      <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.28em] ${theme.muted}`}>{eyebrow}</p>
      <h3 className={`mt-2 text-3xl font-black leading-tight ${theme.copy}`}>{title}</h3>
      <p className={`mt-3 text-sm leading-relaxed ${theme.muted}`}>{description}</p>

      {ctaLabel ? (
        <div className="mt-auto pt-4">
          <span
            className={`inline-flex rounded-full border px-3 py-2 text-xs font-semibold transition ${theme.button}`}
          >
            {ctaLabel}
          </span>
        </div>
      ) : null}
    </article>
  );

  if (!href) {
    return content;
  }

  return (
    <Link className="block h-full" href={href}>
      {content}
    </Link>
  );
}
