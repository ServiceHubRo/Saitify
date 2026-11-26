import Link from 'next/link';

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" alt="" width={size} height={size} className="rounded-[28%]" />
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Saitlify home"
      className="inline-flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet"
    >
      <LogoMark />
      <span
        className={`text-xl font-semibold tracking-tight ${light ? 'text-white' : 'text-midnight'}`}
      >
        Saitlify
      </span>
    </Link>
  );
}
