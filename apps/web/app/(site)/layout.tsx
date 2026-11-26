import type { ReactNode } from 'react';
import { Footer } from '../../components/footer';
import { Header } from '../../components/header';
import { SkipLink } from '../../components/skip-link';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
