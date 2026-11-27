import { describe, expect, it } from 'vitest';
import { isCommonPassword, passwordRules, validatePassword } from './auth/validation';

describe('password strength (Phase 11)', () => {
  it('refuses very common passwords, with their usual decorations and look-alike letters', () => {
    for (const pw of ['password1234', 'Password1234!', 'P@ssw0rd2026', 'qwertyuiop', 'Qwerty123456', 'iloveyou123', 'Parola2026!!', 'parolamea12', 'Romania2026', 'Bucuresti123', 'letmein1234', 'Welcome2026', '1234567890', '00000000000', 'aaaaaaaaaaaa', 'abcabcabcabc', '1212121212', 'Saitlify2026', 'Mihaela12345', 'P4$$word99']) {
      expect(isCommonPassword(pw), pw).toBe(true);
      expect(validatePassword(pw), pw).toMatch(/very common/);
    }
  });

  it('accepts passphrases, random-looking passwords and ordinary long passwords', () => {
    for (const pw of ['correct-horse-battery', 'blue river coffee table', 'Tr0ub4dor&3-staple-x', 'zXk93!pQ7rLm2', 'Cofetăria-Dulce-2026-Vara', 'mY-dog-eats-green-apples', 'harta-cu-comoara-ascunsa']) {
      expect(isCommonPassword(pw), pw).toBe(false);
      expect(validatePassword(pw, { email: 'ana@example.com', name: 'Ana Pop' }), pw).toBeNull();
    }
  });

  it('refuses passwords containing the person\'s email local part or name (accents and case ignored)', () => {
    const ctx = { email: 'stefan.taranu@example.com', name: 'Ștefan Țăranu' };
    for (const pw of ['stefan.taranu-2026-xyz', 'My-STEFAN-is-here-123', 'taranu-is-my-family-9', 'Stefan Taranu is great', 'xx-ștefan-țăranu-xx']) {
      expect(validatePassword(pw, ctx), pw).toMatch(/email or name/);
    }
    // A short name or local part is not treated as secret: "ana" inside a long passphrase is fine.
    expect(validatePassword('banana-split-sunday-brunch', { email: 'ana@example.com', name: 'Ana' })).toBeNull();
  });

  it('keeps the length rule first and reports the rules the sign-up form shows', () => {
    expect(validatePassword('short')).toMatch(/at least 10/i);
    expect(passwordRules('password1234', {}).map((r) => [r.id, r.ok])).toEqual([['length', true], ['common', false], ['personal', true]]);
  });
});
