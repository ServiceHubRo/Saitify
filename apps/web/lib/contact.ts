export const LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  subject: { min: 3, max: 150 },
  message: { min: 10, max: 5000 },
} as const;

/** Minimum time (ms) between the form being shown and submitted. Bots tend to be faster. */
export const MIN_FILL_MS = 2500;

export type ContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Honeypot: real users never see or fill this field. */
  website?: string;
  /** Milliseconds between form render and submit. */
  elapsed?: number;
};

export type ContactErrors = Partial<Record<'name' | 'email' | 'subject' | 'message', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateContact(input: ContactInput): ContactErrors {
  const errors: ContactErrors = {};
  const name = input.name.trim();
  const email = input.email.trim();
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (name.length < LIMITS.name.min) errors.name = 'Please enter your name.';
  else if (name.length > LIMITS.name.max) errors.name = `Keep your name under ${LIMITS.name.max} characters.`;

  if (!email) errors.email = 'Please enter your email address.';
  else if (email.length > LIMITS.email.max || !EMAIL_RE.test(email))
    errors.email = 'Please enter a valid email address.';

  if (subject.length < LIMITS.subject.min) errors.subject = 'Please add a short subject.';
  else if (subject.length > LIMITS.subject.max)
    errors.subject = `Keep the subject under ${LIMITS.subject.max} characters.`;

  if (message.length < LIMITS.message.min)
    errors.message = `Please write at least ${LIMITS.message.min} characters.`;
  else if (message.length > LIMITS.message.max)
    errors.message = `Keep your message under ${LIMITS.message.max} characters.`;

  return errors;
}

/** True when the submission looks automated (filled honeypot or submitted too quickly). */
export function looksLikeSpam(input: ContactInput): boolean {
  if (input.website && input.website.trim() !== '') return true;
  if (typeof input.elapsed === 'number' && input.elapsed < MIN_FILL_MS) return true;
  return false;
}

export function subjectForTopic(topic: string | undefined): string {
  if (topic === 'pricing') return 'Pricing question';
  return '';
}
