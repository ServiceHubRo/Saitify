export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="space-y-6">
      <div className="h-9 w-64 rounded-xl bg-midnight/10 motion-safe:animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-3xl bg-midnight/5 motion-safe:animate-pulse" />)}
      </div>
      <span className="sr-only">Loading your projects…</span>
    </div>
  );
}
