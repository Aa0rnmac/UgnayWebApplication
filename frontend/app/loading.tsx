export default function GlobalLoadingPage() {
  return (
    <section className="min-h-[50vh] d-flex items-center justify-content-center">
      <div className="rounded-4 border border-brandBorder bg-white px-4 py-4 text-center shadow-soft">
        <div className="spinner-border text-primary" role="status" aria-hidden="true" />
        <p className="mb-0 mt-2 text-sm fw-semibold text-slate-700">Loading, please wait...</p>
      </div>
    </section>
  );
}
