/** Accessible accordion built on native <details>/<summary>: keyboard and screen reader support without JS. */
export function FaqList({ items }: { items: ReadonlyArray<{ q: string; a: string }> }) {
  return (
    <div className="divide-y divide-midnight/10 rounded-2xl border border-midnight/10 bg-white">
      {items.map((item) => (
        <details key={item.q} className="group px-5 sm:px-6">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-semibold text-midnight marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet sm:text-lg [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <svg
              className="h-5 w-5 shrink-0 text-violet transition group-open:rotate-45"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </summary>
          <p className="pb-5 pr-8 text-base leading-relaxed text-midnight/70">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
