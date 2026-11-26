import { CTA_HREF, NAV } from '../lib/site';
import { Logo } from './logo';
import { MobileNav } from './mobile-nav';
import { ButtonLink, Container } from './ui';
import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-midnight/5 bg-white/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded text-[15px] font-medium text-midnight/75 transition hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:block">
          <ButtonLink href={CTA_HREF} className="min-h-11 px-5 text-[15px]">
            Create your website
          </ButtonLink>
        </div>
        <MobileNav />
      </Container>
    </header>
  );
}
