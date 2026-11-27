import { isPrivatePath } from './routes';

export const LIMITS = { name: { min: 1, max: 100 }, email: { max: 254 }, password: { min: 10, max: 128 } } as const;
export const TERMS_VERSION = '2026-11-draft';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export const normalizeEmail = (v: string) => v.trim().toLowerCase();

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (v.length > LIMITS.email.max || !EMAIL_RE.test(v) || v.includes('..')) return 'Enter a valid email address.';
  return null;
}

export function validateName(value: string): string | null {
  const v = value.trim();
  if (v.length < LIMITS.name.min) return 'Enter your name.';
  if (v.length > LIMITS.name.max) return `Keep your name under ${LIMITS.name.max} characters.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(v)) return 'Your name contains characters we cannot accept.';
  return null;
}

/* ------------------------------------------------------------------ password strength (small, server-side, no dependency) */

const fold = (v: string) => v.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const deLeet = (v: string) => [...v].map((c) => LEET[c] ?? c).join('');

/** Whole passwords that are on every attacker's list (compared in lower case). */
const COMMON_EXACT = new Set([
  '1234567890', '12345678910', '123456789012', '0123456789', '0987654321', '1q2w3e4r5t', '1qaz2wsx3edc', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm123',
  'abcdefghij', 'abc1234567', 'a1b2c3d4e5', 'q1w2e3r4t5', 'qwertyuiop1', 'passw0rd123', 'iloveyou123', 'letmein1234', 'trustno1234',
].map(fold));

/**
 * Common words and names that people build passwords from. A password is refused when, after removing digits and symbols from its
 * ends and undoing look-alike letters (p@ssw0rd), nothing but one of these remains. This catches "Password1234!" and "Parola2026"
 * without a large list, and never blocks a passphrase of unrelated words.
 */
const COMMON_BASES = new Set([
  // English
  'password', 'passwd', 'passphrase', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'letmein', 'welcome', 'admin', 'administrator', 'login', 'master', 'monkey',
  'dragon', 'football', 'baseball', 'basketball', 'soccer', 'hockey', 'sunshine', 'princess', 'superman', 'batman', 'iloveyou', 'trustno', 'starwars', 'shadow',
  'michael', 'jennifer', 'jordan', 'hunter', 'charlie', 'flower', 'freedom', 'whatever', 'access', 'hello', 'mustang', 'ranger', 'summer', 'winter', 'secret',
  'computer', 'internet', 'changeme', 'default', 'guest', 'test', 'testing', 'temp', 'abcdefghij', 'abcdefgh', 'qazwsx', 'iloveu', 'lovely', 'cheese', 'pepper',
  'cookie', 'ginger', 'tigger', 'buster', 'killer', 'jessica', 'ashley', 'daniel', 'andrew', 'joshua', 'matthew', 'thomas', 'george', 'robert', 'london',
  // Romanian
  'parola', 'parolamea', 'parolasecreta', 'romania', 'bucuresti', 'brasov', 'cluj', 'timisoara', 'iasi', 'constanta', 'iubire', 'iubesc', 'teiubesc', 'iloveyou',
  'fotbal', 'steaua', 'dinamo', 'salut', 'bunadimineata', 'multumesc', 'andrei', 'alexandru', 'cristian', 'bogdan', 'gabriel', 'mihai', 'mihaela', 'elena',
  'maria', 'ionut', 'vasile', 'adrian', 'florin', 'razvan', 'daniela', 'andreea', 'alexandra', 'ioana', 'cosmin', 'catalin', 'marius', 'sorin',
  // this product
  'saitify', 'saitlify', 'saitlifyro', 'website', 'builder',
].map(fold));

/** True for passwords that are guessable without any knowledge of the person. */
export function isCommonPassword(password: string): boolean {
  const lower = fold(password);
  if (COMMON_EXACT.has(lower)) return true;
  if (/^(.)\1+$/.test(lower)) return true; // aaaaaaaaaa
  if (/^(.{1,4})\1{2,}$/.test(lower)) return true; // abcabcabcabc, 1212121212
  if (/^[0-9]+$/.test(lower) && lower.length <= 12) return true; // digits only: phone numbers, dates, sequences
  const stripped = lower.replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, ''); // digits and symbols at the ends
  for (const candidate of [stripped, deLeet(stripped)]) {
    if (candidate && COMMON_BASES.has(candidate) && lower.length - candidate.length <= 6) return true;
  }
  return false;
}

/** The person's own details, in a form that is hard to hide inside a password. */
function personalTokens(ctx: { email?: string; name?: string }): string[] {
  const local = fold((ctx.email ?? '').split('@')[0] ?? '').replace(/[^a-z0-9]/g, '');
  const name = fold(ctx.name ?? '');
  const tokens = name.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const joined = name.replace(/[^a-z0-9]/g, '');
  return [...new Set([local, joined, ...tokens].filter((t) => t.length >= 4))];
}

export type PasswordRule = { id: 'length' | 'common' | 'personal'; label: string; ok: boolean };

/** Rules shown to the user and enforced on the server. Length and a blocklist follow NIST 800-63B (no forced symbols). */
export function passwordRules(password: string, ctx: { email?: string; name?: string } = {}): PasswordRule[] {
  const folded = fold(password).replace(/[^a-z0-9]/g, '');
  return [
    { id: 'length', label: `At least ${LIMITS.password.min} characters`, ok: password.length >= LIMITS.password.min && password.length <= LIMITS.password.max },
    { id: 'common', label: 'Not a commonly used password', ok: !isCommonPassword(password) },
    { id: 'personal', label: 'Does not contain your email or name', ok: !personalTokens(ctx).some((t) => folded.includes(t)) },
  ];
}

const PASSWORD_MESSAGES: Record<PasswordRule['id'], string> = {
  length: `Use at least ${LIMITS.password.min} characters.`,
  common: 'That password is very common, so it is easy to guess. Try three or four unrelated words instead, for example “blue river coffee table”.',
  personal: 'Please do not use your email or name in the password: those are the first things anyone would try.',
};

export function validatePassword(password: string, ctx: { email?: string; name?: string } = {}): string | null {
  if (password.length > LIMITS.password.max) return `Use at most ${LIMITS.password.max} characters.`;
  const failed = passwordRules(password, ctx).find((r) => !r.ok);
  return failed ? PASSWORD_MESSAGES[failed.id] : null;
}

/** Only same-site, in-app paths are accepted as post-login destinations. Everything else falls back. */
export function safeNext(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || value.length > 300) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.includes('\\') || [...value].some((c) => c.charCodeAt(0) < 32)) return fallback;
  let path: string;
  try {
    path = new URL(value, 'https://x.invalid').pathname;
  } catch {
    return fallback;
  }
  // Any private page is a valid destination after signing in (the admin page still checks the role on the server).
  return isPrivatePath(path) ? value : fallback;
}
