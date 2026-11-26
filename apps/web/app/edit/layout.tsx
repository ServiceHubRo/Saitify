import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@saitify/engine/styles.css';

export const metadata: Metadata = { title: 'Edit your website', robots: { index: false, follow: false } };

export default function EditLayout({ children }: { children: ReactNode }) {
  return children;
}
