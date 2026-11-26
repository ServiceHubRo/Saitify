import type { Metadata } from 'next';
import { Footer } from '../components/footer';
import { Header } from '../components/header';
import { ButtonLink, Container } from '../components/ui';

import { SkipLink } from '../components/skip-link';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <>
      <SkipLink />
      <Header />
      <main id="main">
    <section className="bg-cloud py-24 sm:py-32">
      <Container className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet">404</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-midnight sm:text-5xl">
          This page does not exist
        </h1>
        <p className="mx-auto mt-5 max-w-md text-lg text-midnight/70">
          The link may be wrong or the page may have moved.
        </p>
        <div className="mt-8">
          <ButtonLink href="/">Back to the homepage</ButtonLink>
        </div>
      </Container>
    </section>
      </main>
      <Footer />
    </>
  );
}
