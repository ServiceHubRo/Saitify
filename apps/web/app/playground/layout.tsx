import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@saitify/engine/styles.css';

export const metadata: Metadata = {
  title: 'Engine playground',
  robots: { index: false, follow: false },
};

export default function PlaygroundLayout({ children }: { children: ReactNode }) {
  return children;
}
