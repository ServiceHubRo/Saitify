import { describe, expect, it } from 'vitest';
import { stripeConfigured, stripeMode, webhookConfigured } from './billing/stripe-api';
import { createStripeApi, BillingConfigError } from './billing';
import { isStaging, stagingLiveKeyConflict } from './staging';

describe('staging flag', () => {
  it('is on only for true/1/yes/on, in any case', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'on', ' true ']) expect(isStaging({ STAGING: v }), v).toBe(true);
    for (const v of [undefined, '', 'false', '0', 'no', 'off', 'prod']) expect(isStaging({ STAGING: v }), String(v)).toBe(false);
  });
});

describe('live Stripe keys are refused on staging', () => {
  const live = { STRIPE_SECRET_KEY: 'sk_live_' + 'x'.repeat(24), STRIPE_WEBHOOK_SECRET: 'whsec_' + 'y'.repeat(24) };
  const test = { STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24), STRIPE_WEBHOOK_SECRET: 'whsec_' + 'y'.repeat(24) };

  it('staging + live key: billing is off, the webhook is off, no client can be created', () => {
    const env = { ...live, STAGING: 'true' };
    expect(stagingLiveKeyConflict(env)).toBe(true);
    expect(stripeConfigured(env)).toBe(false);
    expect(webhookConfigured(env)).toBe(false);
    expect(stripeMode(env)).toBeNull();
    expect(() => createStripeApi(env)).toThrow(BillingConfigError);
  });

  it('staging + test key works as before', () => {
    const env = { ...test, STAGING: 'true' };
    expect(stagingLiveKeyConflict(env)).toBe(false);
    expect(stripeConfigured(env)).toBe(true);
    expect(webhookConfigured(env)).toBe(true);
    expect(stripeMode(env)).toBe('test');
  });

  it('production with a live key is unchanged (the guard applies to staging only)', () => {
    expect(stagingLiveKeyConflict(live)).toBe(false);
    expect(stripeConfigured(live)).toBe(true);
    expect(stripeMode(live)).toBe('live');
    expect(stripeConfigured({ ...live, STAGING: 'false' })).toBe(true);
  });

  it('restricted live keys (rk_live_) are refused too', () => {
    expect(stripeConfigured({ STRIPE_SECRET_KEY: 'rk_live_' + 'x'.repeat(24), STAGING: '1' })).toBe(false);
  });
});
