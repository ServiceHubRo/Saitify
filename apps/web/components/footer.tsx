import Link from 'next/link';
import { FOOTER_GROUPS, SITE } from '../lib/site';
import { Logo } from './logo';
import { Container } from './ui';

export function Footer() {
  return (
    <footer className="bg-midnight text-white">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo light />
            <p className="mt-4 text-[15px] leading-relaxed text-lavender">
              {SITE.tagline} Create a professional website for your business without coding.
            </p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/60">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[15px] text-white/85 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-12 border-t border-white/10 pt-6 text-sm text-white/60">
          © {new Date().getFullYear()} Saitify. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
