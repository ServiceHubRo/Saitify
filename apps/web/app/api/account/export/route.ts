import { exportAccount } from '@saitify/platform';
import { api, fail } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const GET = api({ auth: true }, async ({ ctx, session }) => {
  const data = await exportAccount(ctx, session!.user.id);
  if (!data) return fail(404, { code: 'not_found', message: 'Account not found.' });
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="saitify-account-export.json"', 'Cache-Control': 'no-store' },
  });
});
