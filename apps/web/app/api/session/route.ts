import { api, ok } from '../../../lib/server/api';

export const dynamic = 'force-dynamic';

/** Lets client pages ask "am I signed in?" without exposing anything beyond the public profile. */
export const GET = api({}, async ({ session }) => ok({ user: session ? { name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified } : null }));
