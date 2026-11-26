import { ENGINE_CSS, ENGINE_CSS_HASH } from '../../../../lib/published/engine-css.generated';

export const dynamic = 'force-static';

/** The engine stylesheet for published websites. Versioned by content hash, so it can be cached forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const current = file === `${ENGINE_CSS_HASH}.css`;
  return new Response(ENGINE_CSS, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      // An old hash (from a page cached before an update) still gets working styles, but is never cached as permanent.
      'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
