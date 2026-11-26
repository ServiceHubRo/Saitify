import 'server-only';
import { createStripeApi, isAdmin, type StripeApi } from '@saitify/platform';
import { appUrl } from './platform';

/** A Stripe client, or a BillingConfigError the API turns into a calm "not available yet". Never fakes a payment provider. */
export const stripeApi = (): StripeApi => createStripeApi(process.env);
export const billingCfg = () => ({ appUrl: appUrl() });
export const adminOnly = (user: { email: string; emailVerified: boolean }) => isAdmin(user, process.env);
