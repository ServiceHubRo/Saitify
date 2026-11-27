/** A small, always-visible label on staging deployments, so nobody mistakes them for the real site. Never rendered in production. */
export function StagingLabel() {
  return (
    <div role="note" className="pointer-events-none fixed bottom-2 left-2 z-[100] rounded-full bg-amber-300 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-midnight shadow-md ring-1 ring-midnight/30" data-testid="staging-label">
      Staging · test environment
    </div>
  );
}
