import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@saitify/engine/styles.css';

export const metadata: Metadata = {
  title: 'Create your website',
  description: 'Describe your idea, answer a few simple questions and see your website take shape.',
  robots: { index: false, follow: true },
};

export default function CreateLayout({ children }: { children: ReactNode }) {
  return children;
}
