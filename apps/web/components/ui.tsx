import Link from 'next/link';
import type { ReactNode } from 'react';

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Section({
  children,
  className = '',
  id,
  tone = 'plain',
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: 'plain' | 'cloud';
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`py-16 sm:py-24 ${tone === 'cloud' ? 'bg-cloud' : 'bg-white'} ${className}`}
    >
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-violet">{children}</p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  id,
  align = 'center',
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  id?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={`max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        id={id}
        className="text-3xl font-semibold tracking-tight text-midnight sm:text-4xl [text-wrap:balance]"
      >
        {title}
      </h2>
      {text ? <p className="mt-4 text-lg leading-relaxed text-midnight/70">{text}</p> : null}
    </div>
  );
}

const base =
  'inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet';

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'light';
  className?: string;
}) {
  const styles = {
    primary:
      'bg-gradient-to-r from-violet to-blue text-white shadow-lg shadow-violet/25 hover:brightness-110',
    secondary: 'border border-midnight/15 bg-white text-midnight hover:border-violet hover:text-violet',
    light: 'bg-white text-midnight shadow-lg shadow-midnight/20 hover:bg-cloud',
  }[variant];
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function Badge({
  children,
  tone = 'violet',
}: {
  children: ReactNode;
  tone?: 'violet' | 'blue' | 'neutral';
}) {
  const styles = {
    violet: 'bg-violet/10 text-violet',
    blue: 'bg-blue/10 text-midnight',
    neutral: 'bg-midnight/5 text-midnight/70',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>
      {children}
    </span>
  );
}

export function PageHero({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-cloud pb-14 pt-16 sm:pb-20 sm:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] max-w-[140%] -translate-x-1/2 rounded-full bg-gradient-to-r from-violet/20 to-blue/20 blur-3xl"
      />
      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-4xl font-semibold tracking-tight text-midnight sm:text-5xl [text-wrap:balance]">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-midnight/70 sm:text-xl">{text}</p>
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}

export function CtaBand({
  title = 'Your website starts with an idea.',
  text = 'Create a free account, answer a few simple questions and see your website take shape. No card needed.',
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="bg-white pb-16 sm:pb-24">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-midnight px-6 py-14 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet/50 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-blue/40 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl [text-wrap:balance]">
              {title}
            </h2>
            <p className="mt-4 text-lg text-lavender">{text}</p>
            <div className="mt-8">
              <ButtonLink href="/create" variant="light">
                Start free
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
