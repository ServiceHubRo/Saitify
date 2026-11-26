import { ENGINE_VERSION } from '@saitify/engine';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-midnight px-6 text-center text-cloud">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Saitify" width={96} height={96} />
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Saitify</h1>
      <p className="max-w-md text-lg text-lavender">
        Site-ul tău, gata în câteva minute. În curând.
      </p>
      <span className="text-sm text-secondary">engine v{ENGINE_VERSION}</span>
    </main>
  );
}
