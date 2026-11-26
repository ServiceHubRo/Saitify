'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';

export type MenuItem = { label: string; icon?: IconName; onSelect: () => void; disabled?: boolean; danger?: boolean; separatorBefore?: boolean };

/** Contextual menu: button + popover list with roving focus (arrows, Home/End, Escape, Tab closes). */
export function Menu({ label, items, trigger, align = 'right' }: { label: string; items: MenuItem[]; trigger?: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const up = window.innerHeight - r.bottom < 280 && r.top > 280;
      const width = 232;
      setPos({ up, top: up ? window.innerHeight - r.top + 6 : r.bottom + 6, left: Math.max(8, Math.min(align === 'right' ? r.right - width : r.left, window.innerWidth - width - 8)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    window.setTimeout(() => list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus(), 0);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, pos !== null]);

  function onKey(e: React.KeyboardEvent) {
    const els = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={trigger ? 'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[15px] font-medium text-midnight/85 hover:bg-midnight/8 focus-visible:outline-2 focus-visible:outline-violet' : 'grid size-11 shrink-0 place-items-center rounded-xl text-midnight/75 hover:bg-midnight/8 focus-visible:outline-2 focus-visible:outline-violet'}
      >
        {trigger ?? <Icon name="more" className="size-[18px]" />}
      </button>
      {open && pos
        ? createPortal(
            <div ref={list} id={id} role="menu" aria-label={label} onKeyDown={onKey} style={{ position: 'fixed', left: pos.left, width: 232, ...(pos.up ? { bottom: pos.top } : { top: pos.top }) }} className="z-[100] rounded-2xl border border-midnight/10 bg-white p-1.5 text-midnight shadow-2xl">
              {items.map((it) => (
                <div key={it.label}>
                  {it.separatorBefore ? <div role="separator" className="my-1 h-px bg-midnight/10" /> : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(false);
                      button.current?.focus();
                      it.onSelect();
                    }}
                    className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] focus-visible:outline-2 focus-visible:outline-violet disabled:cursor-not-allowed disabled:opacity-40 ${it.danger ? 'text-red-700 hover:bg-red-50' : 'hover:bg-violet/10'}`}
                  >
                    {it.icon ? <Icon name={it.icon} className="size-4" /> : null}
                    {it.label}
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
