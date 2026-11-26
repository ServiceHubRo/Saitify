import { NextResponse } from 'next/server';
import { looksLikeSpam, validateContact, type ContactInput } from '../../../lib/contact';

export const dynamic = 'force-dynamic';

/**
 * Contact endpoint. Sends through Resend when CONTACT_RESEND_API_KEY, CONTACT_TO_EMAIL and
 * CONTACT_FROM_EMAIL are set. Otherwise it answers 503 "not_configured" and never reports success.
 * Rate limiting is NOT implemented (it needs shared storage); see docs/PHASE1.md.
 */
export async function POST(request: Request) {
  let body: Partial<ContactInput>;
  try {
    body = (await request.json()) as Partial<ContactInput>;
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.email.trim(),
      subject: `[Saitify contact] ${input.subject.trim()}`,
      text: `From: ${input.name.trim()} <${input.email.trim()}>\n\n${input.message.trim()}`,
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json({ error: 'delivery_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
