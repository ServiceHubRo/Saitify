/**
 * Website text is plain text in the engine's content model and React escapes it when rendering, so nothing a
 * visitor or editor types can become markup. Cleaning still removes pasted HTML tags and control characters so
 * stored content stays tidy and can never carry stray markup into future exports.
 */
const TAG = /<\/?[a-z][^>]*>/gi;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g;

export function cleanText(input: string, opts: { multiline?: boolean } = {}): string {
  let s = String(input).replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(TAG, '');
  if (opts.multiline) s = s.replace(/\n{3,}/g, '\n\n');
  else s = s.replace(/\s*\n\s*/g, ' ');
  return s;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** Accepts "#abc", "abc", "#aabbcc" and returns "#AABBCC", or null when the value is not a color. */
export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  const out = `#${s}`;
  return HEX.test(out) ? out.toUpperCase() : null;
}

/** Lowercase, hyphenated, ASCII-only slug from any name ("Despre noi" -> "despre-noi", "Café" -> "cafe"). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
