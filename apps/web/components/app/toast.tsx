'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Toast = { id: number; tone: 'success' | 'error'; text: string };
const Ctx = createContext<(tone: Toast['tone'], text: string) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

/** Short confirmations ("Project archived"). Announced politely; errors stay longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++seq.current;
    setItems((s) => [...s.slice(-2), { id, tone, text }]);
    window.setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === 'error' ? 9000 : 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        {items.map((t) => (
          <p key={t.id} className={`pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-[15px] font-medium shadow-lg ${t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-midnight text-white'}`}>{t.text}</p>
        ))}
      </div>
    </Ctx.Provider>
  );
}
