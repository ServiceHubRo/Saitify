import '@saitify/engine/styles.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '../../components/app/toast';

export const metadata: Metadata = { title: 'Website editor', robots: { index: false, follow: false } };

export default function EditorLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
