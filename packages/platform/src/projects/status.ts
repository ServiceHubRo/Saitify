/**
 * Central project status model. Only states that really exist are listed.
 * There is deliberately no "published" or "live": publishing arrives in a later phase.
 */
export const STORED_STATUSES = ['draft', 'configured'] as const;
export type StoredStatus = (typeof STORED_STATUSES)[number];
export type DisplayStatus = StoredStatus | 'archived';

export const STATUS_INFO: Record<DisplayStatus, { label: string; description: string }> = {
  draft: { label: 'Draft', description: 'Still being set up. Continue where you left off.' },
  configured: { label: 'Configured', description: 'All steps are complete and the website configuration is ready.' },
  archived: { label: 'Archived', description: 'Hidden from your active projects. You can restore it any time.' },
};

export const displayStatus = (stored: StoredStatus, archivedAt: Date | string | null): DisplayStatus => (archivedAt ? 'archived' : stored);
