import { notFound } from 'next/navigation';
import { Playground } from './playground';

/** Development tool. Available locally, or where PLAYGROUND_ENABLED=true is set. Never indexed. */
export const dynamic = 'force-dynamic';

export default function PlaygroundPage() {
  if (process.env.NODE_ENV === 'production' && process.env.PLAYGROUND_ENABLED !== 'true') notFound();
  return <Playground />;
}
