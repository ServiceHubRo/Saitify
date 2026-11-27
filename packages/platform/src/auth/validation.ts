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

const COMMON = new Set(
  ['password', 'password1', 'password12', 'password123', 'passw0rd123', '1234567890', '12345678910', '123456789012', 'qwertyuiop', 'qwerty12345', 'qwerty123456', 'iloveyou123', 'letmein1234', 'welcome1234', 'admin12345', 'administrator', 'abcdefghij', 'abc1234567', '0123456789', '1q2w3e4r5t', 'saitify123', 'saitify1234', 'saitlify123', 'saitlify1234', 'parola12345', 'parola123456'].map((s) => s.toLowerCase()),
);

export type PasswordRule = { id: 'length' | 'common' | 'personal'; label: string; ok: boolean };

/** Rules shown to the user and enforced on the server. Length and denylist follow NIST 800-63B (no forced symbols). */
export function passwordRules(password: string, ctx: { email?: string; name?: string } = {}): PasswordRule[] {
  const lower = password.toLowerCase();
  const local = (ctx.email ?? '').split('@')[0]?.toLowerCase() ?? '';
  const name = (ctx.name ?? '').trim().toLowerCase();
  return [
    { id: 'length', label: `At least ${LIMITS.password.min} characters`, ok: password.length >= LIMITS.password.min && password.length <= LIMITS.password.max },
    { id: 'common', label: 'Not a commonly used password', ok: !COMMON.has(lower) && !/^(.)\1+$/.test(password) },
    { id: 'personal', label: 'Does not contain your email or name', ok: !(local.length >= 4 && lower.includes(local)) && !(name.length >= 4 && lower.includes(name)) },
  ];
}

const PASSWORD_MESSAGES: Record<PasswordRule['id'], string> = {
  length: `Use at least ${LIMITS.password.min} characters.`,
  common: 'That password is too common. Choose something less predictable.',
  personal: 'Do not include your email or name in the password.',
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
