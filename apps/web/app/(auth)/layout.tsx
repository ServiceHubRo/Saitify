import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SkipLink } from '../../components/skip-link';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      {children}
    </>
  );
}
