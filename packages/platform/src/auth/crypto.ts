import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 128 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, keylen, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$N$r$p$salt$hash` (base64). Parameters are stored so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; needsRehash: boolean }> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return { ok: false, needsRehash: false };
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  const ok = key.length === expected.length && timingSafeEqual(key, expected);
  return { ok, needsRehash: ok && (Number(n) !== N || Number(r) !== R || Number(p) !== P) };
}

let dummy: Promise<string> | undefined;
/** Verifies against a throwaway hash so "unknown email" costs the same time as "wrong password". */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('saitify-timing-equaliser');
  await verifyPassword(password, await dummy);
}

/** 256-bit URL-safe random token. Only its SHA-256 hash is stored. */
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const hashKey = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);
