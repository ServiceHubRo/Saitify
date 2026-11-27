import 'server-only';
import { getSession, sessionCookieName, type SessionInfo } from '@saitify/platform';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { cookiesAreSecure, getCtx } from './platform';

export const SESSION_COOKIE = () => sessionCookieName(cookiesAreSecure());

/** One lookup per request, shared by layouts, pages and handlers. */
export const currentSession = cache(async (): Promise<SessionInfo | null> => {
  const token = (await cookies()).get(SESSION_COOKIE())?.value;
  if (!token) return null;
  return getSession(await getCtx(), token);
});

/** For protected pages: sends visitors without a valid session to sign in and brings them back afterwards. */
export async function requireSession(returnTo: string): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return s;
}

export async function setSessionCookie(token: string, maxAgeSec: number | null) {
  (await cookies()).set(SESSION_COOKIE(), token, {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: 'lax',
    path: '/',
    ...(maxAgeSec ? { maxAge: maxAgeSec } : {}),
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE(), '', { httpOnly: true, secure: cookiesAreSecure(), sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE())?.value;
}
