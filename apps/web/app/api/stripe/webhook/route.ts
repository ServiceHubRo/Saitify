import { processWebhookEvent, verifyWebhook, webhookConfigured } from '@saitify/platform';
import { NextResponse } from 'next/server';
import { getCtx } from '../../../../lib/server/platform';

export const dynamic = 'force-dynamic';

const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Stripe → Saitlify. Not cookie-authenticated and not subject to the browser Origin check: the only credential is Stripe's
 * signature over the exact raw body. An unsigned, altered or replayed request is rejected before anything is read from it.
 * Any processing failure answers 500 so Stripe retries; duplicates answer 200 because the work is already done.
 */
export async function POST(req: Request): Promise<Response> {
  if (!webhookConfigured(process.env)) return reply(503, { error: 'webhook_not_configured' });
  const raw = await req.text();
  if (raw.length > 1_000_000) return reply(413, { error: 'too_large' });
  let event;
  try {
    event = verifyWebhook(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return reply(400, { error: 'invalid_signature' });
  }
  try {
    const outcome = await processWebhookEvent((await getCtx()).db, event);
    return reply(200, { received: true, outcome });
  } catch {
    return reply(500, { error: 'processing_failed' });
  }
}
