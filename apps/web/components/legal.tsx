import type { ReactNode } from 'react';
import { Container } from './ui';

/** Marks information that has not been provided yet and must be completed before launch. */
export function Todo({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
      [To be provided: {children}]
    </mark>
  );
}

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="bg-cloud pb-10 pt-16 sm:pt-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight text-midnight sm:text-5xl">{title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-midnight/70">{intro}</p>
            <div
              role="note"
              className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-[15px] leading-relaxed text-amber-950"
            >
              <strong>Draft, not final.</strong> This page is a structure with placeholders. Business
              details are still missing and the text has not had a legal review. It must be completed
              and reviewed before Saitlify launches.
            </div>
          </div>
        </Container>
      </section>
      <section className="bg-white py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-3xl space-y-10 text-[17px] leading-relaxed text-midnight/80">
            {children}
          </div>
        </Container>
      </section>
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight text-midnight">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
