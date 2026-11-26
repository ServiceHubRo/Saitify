'use client';

import { Button, Notice } from '../../components/app/primitives';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16">
      <h1 className="text-2xl font-semibold text-midnight">We could not load this page</h1>
      <Notice tone="error">Something went wrong on our side. Nothing you saved was lost. Try again in a moment.</Notice>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
