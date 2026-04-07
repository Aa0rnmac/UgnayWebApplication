type SiteFooterProps = {
  variant?: "default" | "bar";
};

export function SiteFooter({ variant = "default" }: SiteFooterProps) {
  const isBar = variant === "bar";

  return (
    <footer
      className={[
        "border-t border-brandBorder px-4 py-4 md:px-8",
        isBar ? "bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.06)]" : "bg-white/92 backdrop-blur-sm"
      ].join(" ")}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-3 text-sm text-slate-700 md:grid-cols-2">
        <div className="space-y-1">
          <p className="font-semibold text-slate-900">Hand &amp; Heart</p>
          <p>09457947871 / 09474939407</p>
          <p>
            <a
              className="text-brandBlue hover:underline"
              href="https://handandheartph.com/"
              rel="noreferrer"
              target="_blank"
            >
              info@handandheartph.com
            </a>
          </p>
          <p>
            <a
              className="text-brandBlue hover:underline"
              href="mailto:hand.heart01@gmail.com"
            >
              hand.heart01@gmail.com
            </a>
          </p>
        </div>

        <div className="space-y-1 md:text-right">
          <p>Unit 507 Goldwell Building</p>
          <p>930 Aurora Blvd. Cubao</p>
          <p>Quezon City, Philippines</p>
          <a
            aria-label="Hand and Heart Facebook page"
            className="mt-1 inline-flex items-center gap-2 text-brandBlue hover:underline md:justify-end"
            href="https://www.facebook.com/AccessHandandHeart"
            rel="noreferrer"
            target="_blank"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brandBlue text-white">
              <svg
                aria-hidden="true"
                className="h-3 w-3"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5h1.7V5c-.3 0-1.4-.1-2.6-.1-2.6 0-4.3 1.6-4.3 4.5V11H7v3h2.9v8h3.6z" />
              </svg>
            </span>
            Facebook Page
          </a>
        </div>
      </div>
    </footer>
  );
}
