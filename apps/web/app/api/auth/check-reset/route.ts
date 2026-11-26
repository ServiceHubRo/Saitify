import { checkResetToken } from '@saitify/platform';
import { api, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx, body }) => ok({ status: await checkResetToken(ctx, str(body.token, 200)) }));
