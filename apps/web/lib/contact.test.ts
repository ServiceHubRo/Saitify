import { describe, expect, it } from 'vitest';
import { looksLikeSpam, MIN_FILL_MS, subjectForTopic, validateContact } from './contact';

const valid = {
  name: 'Ana Pop',
  email: 'ana@example.com',
  subject: 'Early access',
  message: 'I would like to try Saitify.',
};

describe('validateContact', () => {
  it('accepts a valid message', () => {
    expect(validateContact(valid)).toEqual({});
  });

  it('flags every empty field', () => {
    const errors = validateContact({ name: '', email: '', subject: '', message: '' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'message', 'name', 'subject']);
  });

  it('rejects malformed emails', () => {
    for (const email of ['ana', 'ana@', '@example.com', 'ana@example', 'a b@example.com']) {
      expect(validateContact({ ...valid, email }).email).toBeTruthy();
    }
  });

  it('trims whitespace before checking', () => {
    expect(validateContact({ ...valid, name: '   ' }).name).toBeTruthy();
  });

  it('rejects an overlong message', () => {
    expect(validateContact({ ...valid, message: 'x'.repeat(5001) }).message).toBeTruthy();
  });
});

describe('looksLikeSpam', () => {
  it('flags a filled honeypot', () => {
    expect(looksLikeSpam({ ...valid, website: 'http://spam.example', elapsed: 10000 })).toBe(true);
  });

  it('flags a too-fast submission', () => {
    expect(looksLikeSpam({ ...valid, elapsed: MIN_FILL_MS - 1 })).toBe(true);
  });

  it('allows a normal submission', () => {
    expect(looksLikeSpam({ ...valid, website: '', elapsed: MIN_FILL_MS + 1000 })).toBe(false);
  });
});

describe('subjectForTopic', () => {
  it('maps known topics and ignores unknown ones', () => {
    expect(subjectForTopic('early-access')).toBe('Early access request');
    expect(subjectForTopic('pricing')).toBe('Pricing interest');
    expect(subjectForTopic('nope')).toBe('');
    expect(subjectForTopic(undefined)).toBe('');
  });
});
