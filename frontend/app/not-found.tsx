import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel panel-lively space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider label-accent">Page Not Found</p>
        <h2 className="mt-2 text-2xl font-semibold title-gradient">
          The page you are looking for is not available.
        </h2>
      </div>

      <p className="text-sm text-muted">
        Check the link and try again, or return to the main dashboard.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90"
          href="/"
        >
          Go Home
        </Link>
        <Link
          className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
          href="/modules"
        >
          Browse Modules
        </Link>
      </div>
    </section>
  );
}
