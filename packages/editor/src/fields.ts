import { z } from 'zod';
import type { BlockDefinition } from '@saitify/engine';
import { getAt, type Path } from './paths';

/**
 * Editing schema, derived from each block's own content schema. A block never needs editor-specific code:
 * its validation rules are the editing rules. Adding a block to the registry adds its editing panel.
 */
export type Field =
  | { kind: 'text'; path: Path; key: string; label: string; required: boolean; max: number; multiline: boolean; kindHint?: 'href' }
  | { kind: 'select'; path: Path; key: string; label: string; required: boolean; options: string[] }
  /** A reference to a record of a module (for example a form), chosen from the project's own records. Value is its address (slug). */
  | { kind: 'ref'; path: Path; key: string; label: string; required: boolean; ref: string }
  | { kind: 'boolean'; path: Path; key: string; label: string }
  | { kind: 'number'; path: Path; key: string; label: string; required: boolean; min?: number; max?: number }
  | { kind: 'image'; path: Path; key: string; label: string; required: boolean }
  | { kind: 'group'; path: Path; key: string; label: string; required: boolean; fields: Field[] }
  | { kind: 'list'; path: Path; key: string; label: string; itemName: string; min: number; max: number; itemFields: Field[]; itemTitleKey?: string };

const LABELS: Record<string, string> = {
  eyebrow: 'Small heading',
  badge: 'Badge',
  heading: 'Heading',
  subtitle: 'Subtitle',
  description: 'Description',
  primaryCta: 'Main button',
  secondaryCta: 'Second button',
  cta: 'Button',
  image: 'Image',
  backgroundImage: 'Background image',
  decoration: 'Background decoration',
  href: 'Link',
  label: 'Label',
  alt: 'Image description (alt text)',
  src: 'Image address',
  title: 'Title',
  items: 'Items',
  icon: 'Icon',
  quote: 'Quote',
  author: 'Name',
  role: 'Role',
  question: 'Question',
  answer: 'Answer',
  value: 'Value',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  hours: 'Opening hours',
  mapUrl: 'Map link',
};
const ITEM_NAMES: Record<string, string> = { items: 'item', images: 'image', hours: 'row', links: 'link', columns: 'column', testimonials: 'testimonial', stats: 'figure', socials: 'link' };

export const humanize = (key: string): string => {
  if (LABELS[key]) return LABELS[key]!;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

type JS = {
  type?: string;
  properties?: Record<string, JS>;
  required?: string[];
  items?: JS;
  enum?: unknown[];
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  anyOf?: JS[];
  description?: string;
};

const isImage = (n: JS) => n.type === 'object' && !!n.properties?.src && !!n.properties?.alt;

function build(key: string, node: JS, path: Path, required: boolean): Field | null {
  const label = humanize(key);
  if (node.anyOf) {
    const concrete = node.anyOf.find((n) => n.type !== 'null');
    return concrete ? build(key, concrete, path, false) : null;
  }
  if (node.enum) return { kind: 'select', path, key, label, required, options: node.enum.map(String) };
  if (node.type === 'string' && node.description?.startsWith('ref:')) return { kind: 'ref', path, key, label, required, ref: node.description.slice(4) };
  switch (node.type) {
    case 'string':
      return { kind: 'text', path, key, label, required, max: node.maxLength ?? 500, multiline: (node.maxLength ?? 0) > 120, kindHint: node.pattern?.includes('mailto') ? 'href' : undefined };
    case 'boolean':
      return { kind: 'boolean', path, key, label };
    case 'number':
    case 'integer':
      return { kind: 'number', path, key, label, required, min: node.minimum, max: node.maximum };
    case 'object': {
      if (isImage(node)) return { kind: 'image', path, key, label, required };
      const fields = fieldsOf(node, path);
      return fields.length ? { kind: 'group', path, key, label, required, fields } : null;
    }
    case 'array': {
      const item = node.items;
      if (!item) return null;
      if (item.type === 'object') {
        const itemFields = fieldsOf(item, []);
        const titleKey = ['title', 'label', 'question', 'author', 'name', 'heading'].find((k) => item.properties?.[k]);
        return { kind: 'list', path, key, label, itemName: ITEM_NAMES[key] ?? 'item', min: node.minItems ?? 0, max: node.maxItems ?? 50, itemFields, itemTitleKey: titleKey };
      }
      if (item.type === 'string') {
        // A list of plain strings is edited as a list of single-field items.
        return { kind: 'list', path, key, label, itemName: ITEM_NAMES[key] ?? 'item', min: node.minItems ?? 0, max: node.maxItems ?? 50, itemFields: [{ kind: 'text', path: [], key: '', label: 'Text', required: true, max: item.maxLength ?? 200, multiline: false }] };
      }
      return null;
    }
    default:
      return null;
  }
}

function fieldsOf(node: JS, base: Path): Field[] {
  const out: Field[] = [];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const f = build(key, child, [...base, key], node.required?.includes(key) ?? false);
    if (f) out.push(f);
  }
  return out;
}

const cache = new WeakMap<object, Field[]>();

/** Editable fields for a block, in the order the block's schema declares them. Never throws. */
export function fieldsForBlock(block: BlockDefinition): Field[] {
  const hit = cache.get(block);
  if (hit) return hit;
  let fields: Field[];
  try {
    const js = z.toJSONSchema(block.contentSchema as z.ZodType, { io: 'input', unrepresentable: 'any' }) as JS;
    fields = fieldsOf(js, []);
  } catch {
    fields = [];
  }
  cache.set(block, fields);
  return fields;
}

/* ------------------------------------------------------------------ locating content for canvas clicks */

export type Located = { path: Path; kind: 'text' | 'image' };

function walk(value: unknown, path: Path, visit: (p: Path, v: unknown) => boolean | void): boolean {
  if (visit(path, value)) return true;
  if (Array.isArray(value)) return value.some((v, i) => walk(v, [...path, i], visit));
  if (value && typeof value === 'object') return Object.entries(value).some(([k, v]) => walk(v, [...path, k], visit));
  return false;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Finds which content value an element on the canvas shows, by matching the text it displays. */
export function locateText(content: unknown, displayed: string): Located | null {
  const want = norm(displayed);
  if (!want) return null;
  let found: Located | null = null;
  walk(content, [], (p, v) => {
    if (typeof v === 'string' && norm(v) === want && p.length > 0 && p[p.length - 1] !== 'src' && p[p.length - 1] !== 'href') {
      found = { path: p, kind: 'text' };
      return true;
    }
  });
  return found;
}

export function locateImage(content: unknown, src: string | null, alt: string | null): Located | null {
  let found: Located | null = null;
  walk(content, [], (p, v) => {
    if (v && typeof v === 'object' && 'src' in v && typeof (v as { src: unknown }).src === 'string') {
      const o = v as { src: string; alt?: string };
      if ((src && o.src === src) || (!src && alt !== null && (o.alt ?? '') === alt)) {
        found = { path: p, kind: 'image' };
        return true;
      }
    }
  });
  return found;
}

/** For lists of items: the path of the list item that contains a located path (e.g. ['items', 2]). */
export function containingItem(path: Path): Path | null {
  for (let i = path.length - 1; i > 0; i--) if (typeof path[i] === 'number') return path.slice(0, i + 1);
  return null;
}

export const valueAt = (content: unknown, path: Path) => getAt(content, path);

/** Every image object in a section's content, in the order the walk meets them (matches on-canvas order for most blocks). */
export function listImages(content: unknown): Located[] {
  const out: Located[] = [];
  walk(content, [], (p, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { src?: unknown }).src === 'string' && p.length > 0) out.push({ path: p, kind: 'image' });
  });
  return out;
}

/** A valid starting item for a list: a copy of an existing one, else the required fields filled with neutral values. */
export function skeleton(fields: Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.key) continue;
    if (f.kind === 'text' && f.required) out[f.key] = f.kindHint === 'href' ? '/' : `New ${f.label.toLowerCase()}`;
    else if (f.kind === 'select' && f.required) out[f.key] = f.options[0];
    else if (f.kind === 'ref' && f.required) out[f.key] = '';
    else if (f.kind === 'image' && f.required) out[f.key] = { src: 'placeholder:new', alt: '' };
    else if (f.kind === 'group' && f.required) out[f.key] = skeleton(f.fields);
    else if (f.kind === 'number' && f.required) out[f.key] = f.min ?? 0;
    else if (f.kind === 'list' && f.min > 0) out[f.key] = Array.from({ length: f.min }, () => skeleton(f.itemFields));
  }
  return out;
}
