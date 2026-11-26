import 'server-only';
import { getReadyDb, mailerFromEnv, type Ctx } from '@saitify/platform';
import { SITE_URL } from '../site';

/** Public origin used in emails and the cookie `Secure` decision. APP_URL is read at runtime, not baked into the build. */
export const appUrl = () => (process.env.APP_URL || SITE_URL).replace(/\/$/, '');
export const cookiesAreSecure = () => appUrl().startsWith('https://');

export async function getCtx(): Promise<Ctx> {
  return { db: await getReadyDb(), mailer: mailerFromEnv(), baseUrl: appUrl() };
}
