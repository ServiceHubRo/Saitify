import 'server-only';
import { appUrlFromEnv, getReadyDb, mailerFromEnv, type Ctx } from '@saitify/platform';

/** Public origin used in emails and the cookie `Secure` decision. APP_URL is read at runtime, not baked into the build. */
export const appUrl = () => appUrlFromEnv(process.env).url;
export const cookiesAreSecure = () => appUrl().startsWith('https://');

export async function getCtx(): Promise<Ctx> {
  return { db: await getReadyDb(), mailer: mailerFromEnv(), baseUrl: appUrl() };
}
