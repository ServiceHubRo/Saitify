import { consume, getReadyDb, limitKey } from '@saitify/platform';
import { NextResponse } from 'next/server';
import { looksLikeSpam, validateContact, type ContactInput } from '../../../lib/contact';
import { clientIp, sameOrigin } from '../../../lib/server/api';

export const dynamic = 'force-dynamic';

/**
 * Contact endpoint. Sends through Resend when CONTACT_RESEND_API_KEY, CONTACT_TO_EMAIL and CONTACT_FROM_EMAIL are set.
 * Otherwise it answers 503 "not_configured" and never reports success.
 *
 * Every accepted request sends one email, so it is protected like the other public write endpoints: same-origin only, JSON only,
 * a small body limit, and a rate limit per address and per sender, stored in the database so it holds across server instances.
 * (If the database is unreachable the limit falls back to a per-instance counter rather than letting requests through unlimited.)
 */
const MAX_BYTES = 12_000;
const fallback = new Map<string, { n: number; at: number }>();

async function allowed(ip: string, email: string): Promise<{ ok: boolean; retryAfterSec: number }> {
  try {
    const db = await getReadyDb();
    for (const l of [
      { key: limitKey('contact-ip', ip), max: 5, windowSec: 3600 },
      { key: limitKey('contact-email', email.toLowerCase()), max: 3, windowSec: 3600 },
    ]) {
      const r = await consume(db, l);
      if (!r.allowed) return { ok: false, retryAfterSec: r.retryAfterSec };
    }
    return { ok: true, retryAfterSec: 0 };
  } catch {
    const now = Date.now();
    const cur = fallback.get(ip);
    const n = cur && now - cur.at < 3_600_000 ? cur.n + 1 : 1;
    fallback.set(ip, { n, at: cur && now - cur.at < 3_600_000 ? cur.at : now });
    if (fallback.size > 5000) fallback.clear();
    return n <= 5 ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: 600 };
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'bad_origin' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return NextResponse.json({ error: 'invalid_json' }, { status: 415 });
  let body: Partial<ContactInput>;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
    body = JSON.parse(text) as Partial<ContactInput>;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('shape');
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const input: ContactInput = {
    name: String(body.name ?? ''),
    email: String(body.email ?? ''),
    subject: String(body.subject ?? ''),
    message: String(body.message ?? ''),
    website: String(body.website ?? ''),
    elapsed: typeof body.elapsed === 'number' ? body.elapsed : undefined,
  };

  const errors = validateContact(input);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'validation', fields: errors }, { status: 422 });
  }

  if (looksLikeSpam(input)) {
    // Do not reveal the detection to bots; do not send anything.
    return NextResponse.json({ error: 'rejected' }, { status: 400 });
  }

  const apiKey = process.env.CONTACT_RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !to || !from) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  // Counted only for requests that would really send an email.
  const limit = await allowed(clientIp(request), input.email.trim());
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec), 'Cache-Control': 'no-store' } });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.email.trim(),
      subject: `[Saitlify contact] ${input.subject.trim()}`,
      text: `From: ${input.name.trim()} <${input.email.trim()}>\n\n${input.message.trim()}`,
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json({ error: 'delivery_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
