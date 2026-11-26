'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export type Option = { value: string; label: string; description?: string; group?: string; adornment?: ReactNode; keywords?: string };

/**
 * Premium listbox select: grouped, searchable, keyboard driven (arrows, Home/End, Enter, Escape, type to filter).
 * The list is rendered in a portal with fixed positioning so panels with their own scrolling never clip it.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  searchable,
  placeholder = 'Choose…',
  disabled,
  hideLabel,
  emptyText = 'Nothing matches your search.',
  id,
  className = '',
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  searchable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  emptyText?: string;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const uid = id ?? auto;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const showSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.description ?? ''} ${o.group ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q));
  }, [options, query]);
  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 220 && above > below;
      setRect({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8)), top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 240), maxHeight: Math.min(380, up ? above : below), up });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      window.setTimeout(() => (showSearch ? search.current : panel.current)?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(o: Option | undefined) {
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    button.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  }

  let lastGroup: string | undefined;
  return (
    <div className={className}>
      <label htmlFor={uid} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-[13px] font-semibold text-midnight/80'}>{label}</label>
      <button
        ref={button}
        id={uid}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-midnight/20 bg-white px-3 text-left text-[15px] text-midnight transition hover:border-violet/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet disabled:cursor-not-allowed disabled:bg-midnight/5 disabled:text-midnight/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.adornment}
          <span className={`truncate ${selected ? '' : 'text-midnight/55'}`}>{selected?.label ?? placeholder}</span>
        </span>
        <Icon name="down" className="size-4 text-midnight/60" />
      </button>
      {open && rect
        ? createPortal(
            <div
              ref={panel}
              tabIndex={-1}
              onKeyDown={onKey}
              style={{ position: 'fixed', left: rect.left, width: rect.width, maxHeight: rect.maxHeight, ...(rect.up ? { bottom: window.innerHeight - rect.top } : { top: rect.top }) }}
              className="z-[100] flex flex-col overflow-hidden rounded-2xl border border-midnight/10 bg-white text-midnight shadow-2xl outline-none"
            >
              {showSearch ? (
                <div className="relative border-b border-midnight/10 p-2">
                  <Icon name="search" className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-midnight/50" />
                  <input
                    ref={search}
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    aria-label={`Search ${label}`}
                    aria-controls={`${uid}-list`}
                    aria-activedescendant={filtered[active] ? `${uid}-opt-${active}` : undefined}
                    placeholder="Search…"
                    className="min-h-10 w-full rounded-lg bg-cloud pl-9 pr-3 text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-violet"
                  />
                </div>
              ) : null}
              <ul id={`${uid}-list`} role="listbox" aria-label={label} className="overflow-y-auto p-1.5">
                {filtered.length === 0 ? <li role="presentation" className="px-3 py-4 text-sm text-midnight/70">{emptyText}</li> : null}
                {filtered.map((o, i) => {
                  const header = o.group && o.group !== lastGroup ? o.group : null;
                  lastGroup = o.group;
                  return (
                    <li key={o.value} role="presentation">
                      {header ? <div role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-midnight/55">{header}</div> : null}
                      <div
                        id={`${uid}-opt-${i}`}
                        role="option"
                        aria-selected={o.value === value}
                        data-index={i}
                        onMouseMove={() => setActive(i)}
                        onClick={() => pick(o)}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2 text-[15px] ${i === active ? 'bg-violet/10' : ''} ${o.value === value ? 'font-semibold' : ''}`}
                      >
                        {o.adornment}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{o.label}</span>
                          {o.description ? <span className="block text-[13px] font-normal text-midnight/65">{o.description}</span> : null}
                        </span>
                        {o.value === value ? <Icon name="check" className="mt-0.5 size-4 text-violet" /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
