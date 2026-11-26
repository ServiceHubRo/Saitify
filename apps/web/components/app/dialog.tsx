'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal <dialog>: focus is trapped, Escape closes, focus returns to the opener, and the page behind is inert. */
export function Dialog({ open, onClose, title, children, describedBy, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; describedBy?: string; size?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      aria-describedby={describedBy}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-3xl' : 'max-w-md'} max-h-[90dvh] overflow-y-auto rounded-3xl bg-white p-0 text-midnight shadow-2xl backdrop:bg-midnight/50`}
    >
      {open ? (
        <div className="p-6 sm:p-7">
          <h2 id="dialog-title" className="text-xl font-semibold tracking-tight">{title}</h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
