import Stripe from 'stripe';

/**
 * The only door to Stripe. Services depend on this small interface, so billing logic is tested against a recording fake while
 * production uses the official SDK. Secrets are read from the environment here and nowhere else.
 */
export type StripeSubscriptionView = {
  id: string; status: string; customerId: string; priceId: string | null; itemId: string | null; cancelAtPeriodEnd: boolean; canceledAt: number | null;
  currentPeriodStart: number | null; currentPeriodEnd: number | null; trialEnd: number | null;
};
export type StripePriceView = { id: string; productId: string | null; currency: string; unitAmount: number | null; interval: string | null; active: boolean };

export interface StripeApi {
  createCustomer(p: { email: string; name: string; userId: string; idempotencyKey: string }): Promise<{ id: string }>;
  createCheckoutSession(p: { customerId: string; priceId: string; userId: string; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ id: string; url: string }>;
  createPortalSession(p: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveSubscription(id: string): Promise<StripeSubscriptionView>;
  /** Switches the single subscription item to another price. Proration is chosen by the caller. */
  switchPrice(p: { subscriptionId: string; itemId: string; priceId: string; idempotencyKey: string }): Promise<StripeSubscriptionView>;
  setCancelAtPeriodEnd(p: { subscriptionId: string; cancel: boolean; idempotencyKey: string }): Promise<StripeSubscriptionView>;
  cancelNow(p: { subscriptionId: string; idempotencyKey: string }): Promise<StripeSubscriptionView>;
  retrievePrice(id: string): Promise<StripePriceView>;
}

export class BillingConfigError extends Error {
  constructor(message = 'Billing is not set up on this server yet.') {
    super(message);
    this.name = 'BillingConfigError';
  }
}
export class StripeFailure extends Error {
  constructor(public kind: 'config' | 'invalid' | 'unavailable', message: string) {
    super(message);
    this.name = 'StripeFailure';
  }
}

type Env = Record<string, string | undefined>;
export const stripeConfigured = (env: Env = process.env): boolean => /^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY ?? '');
export const webhookConfigured = (env: Env = process.env): boolean => /^whsec_/.test(env.STRIPE_WEBHOOK_SECRET ?? '');
/** Test-mode keys never move real money. Surfaced to administrators so nobody ships test keys by accident. */
export const stripeMode = (env: Env = process.env): 'test' | 'live' | null => (stripeConfigured(env) ? ((env.STRIPE_SECRET_KEY ?? '').includes('_live_') ? 'live' : 'test') : null);

const ts = (n: unknown): number | null => (typeof n === 'number' ? n : null);

function view(s: Stripe.Subscription): StripeSubscriptionView {
  const item = s.items?.data?.[0];
  const anySub = s as unknown as { current_period_start?: number; current_period_end?: number };
  const anyItem = item as unknown as { current_period_start?: number; current_period_end?: number } | undefined;
  return {
    id: s.id, status: s.status, customerId: typeof s.customer === 'string' ? s.customer : s.customer.id, priceId: item?.price?.id ?? null, itemId: item?.id ?? null,
    cancelAtPeriodEnd: Boolean(s.cancel_at_period_end), canceledAt: ts(s.canceled_at),
    currentPeriodStart: ts(anySub.current_period_start) ?? ts(anyItem?.current_period_start), currentPeriodEnd: ts(anySub.current_period_end) ?? ts(anyItem?.current_period_end), trialEnd: ts(s.trial_end),
  };
}

function wrap<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((e: unknown) => {
    const type = (e as { type?: string }).type ?? '';
    // Log the error class only: Stripe errors can echo request details.
    console.error('[saitify] stripe request failed:', type || (e instanceof Error ? e.name : 'unknown'));
    if (type === 'StripeAuthenticationError' || type === 'StripePermissionError') throw new StripeFailure('config', 'Billing is not configured correctly.');
    if (type === 'StripeInvalidRequestError' || type === 'StripeCardError') throw new StripeFailure('invalid', 'The payment provider rejected this request.');
    throw new StripeFailure('unavailable', 'The payment provider is not reachable right now. Please try again in a moment.');
  });
}

export function createStripeApi(env: Env = process.env): StripeApi {
  if (!stripeConfigured(env)) throw new BillingConfigError();
  const key = env.STRIPE_SECRET_KEY!;
  // Automated tests point the real SDK at a local stand-in for Stripe's HTTP API. Never honoured for a live key.
  const local = env.STRIPE_API_HOST && !key.includes('_live_') ? { host: env.STRIPE_API_HOST, port: Number(env.STRIPE_API_PORT) || 80, protocol: env.STRIPE_API_PROTOCOL === 'http' ? ('http' as const) : ('https' as const) } : {};
  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000, appInfo: { name: 'Saitlify' }, ...local });
  return {
    createCustomer: (p) => wrap(async () => ({ id: (await stripe.customers.create({ email: p.email, name: p.name, metadata: { user_id: p.userId } }, { idempotencyKey: p.idempotencyKey })).id })),
    createCheckoutSession: (p) =>
      wrap(async () => {
        const s = await stripe.checkout.sessions.create(
          { mode: 'subscription', customer: p.customerId, client_reference_id: p.userId, line_items: [{ price: p.priceId, quantity: 1 }], success_url: p.successUrl, cancel_url: p.cancelUrl, allow_promotion_codes: true, billing_address_collection: 'auto', subscription_data: { metadata: { user_id: p.userId } }, metadata: { user_id: p.userId } },
          { idempotencyKey: p.idempotencyKey },
        );
        if (!s.url) throw new Error('no checkout url');
        return { id: s.id, url: s.url };
      }),
    createPortalSession: (p) => wrap(async () => ({ url: (await stripe.billingPortal.sessions.create({ customer: p.customerId, return_url: p.returnUrl })).url })),
    retrieveSubscription: (id) => wrap(async () => view(await stripe.subscriptions.retrieve(id))),
    switchPrice: (p) =>
      wrap(async () => view(await stripe.subscriptions.update(p.subscriptionId, { items: [{ id: p.itemId, price: p.priceId }], proration_behavior: 'create_prorations', cancel_at_period_end: false }, { idempotencyKey: p.idempotencyKey }))),
    setCancelAtPeriodEnd: (p) => wrap(async () => view(await stripe.subscriptions.update(p.subscriptionId, { cancel_at_period_end: p.cancel }, { idempotencyKey: p.idempotencyKey }))),
    cancelNow: (p) => wrap(async () => view(await stripe.subscriptions.cancel(p.subscriptionId, undefined, { idempotencyKey: p.idempotencyKey }))),
    retrievePrice: (id) =>
      wrap(async () => {
        const r = await stripe.prices.retrieve(id);
        return { id: r.id, productId: typeof r.product === 'string' ? r.product : (r.product?.id ?? null), currency: r.currency, unitAmount: r.unit_amount, interval: r.recurring?.interval ?? null, active: r.active };
      }),
  };
}

/** Verifies Stripe's signature over the raw request body. Throws if the payload was not sent by Stripe or was altered. */
export function verifyWebhook(rawBody: string, signature: string | null, secret: string, toleranceSec = 300): { id: string; type: string; created: number; data: { object: unknown } } {
  if (!signature) throw new Error('missing signature');
  const verifier = new Stripe('sk_test_signature_verification_only');
  return verifier.webhooks.constructEvent(rawBody, signature, secret, toleranceSec) as unknown as { id: string; type: string; created: number; data: { object: unknown } };
}

/** Produces a valid signature header for a payload. Used by tests (and only tests) to exercise the real verification path. */
export function signWebhookForTest(payload: string, secret: string, timestamp?: number): string {
  return new Stripe('sk_test_signature_verification_only').webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) });
}
