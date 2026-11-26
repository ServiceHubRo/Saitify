import { CONFIG_SCHEMA_VERSION } from '@saitify/engine';
import {
  CATEGORY_NAMES,
  DRAFT_VERSION,
  firstInvalidStep,
  generateProject,
  normalizeState,
  wizardStateSchema,
  type WizardState,
} from '@saitify/configurator';
import type { StoredStatus } from './status';

/** Version of the stored wizard state. Bump together with a migration in WIZARD_MIGRATIONS. */
export const WIZARD_VERSION = DRAFT_VERSION;
export const SITE_VERSION = CONFIG_SCHEMA_VERSION;
export const MAX_WIZARD_BYTES = 200_000;

export type WizardMigration = { from: number; migrate: (raw: unknown) => unknown };
/** Upgrades from older stored versions. Empty today because version 1 is the first stored version. */
export const WIZARD_MIGRATIONS: WizardMigration[] = [];

export type LoadedWizard = { ok: true; wizard: WizardState; migratedFrom: number | null } | { ok: false; reason: 'newer_version' | 'unsupported_version' | 'invalid' };

/** Brings stored data to the current version through explicit migrations, then validates it. Never silently rewrites. */
export function migrateWizard(raw: unknown, version: number, migrations: WizardMigration[] = WIZARD_MIGRATIONS, target = WIZARD_VERSION): LoadedWizard {
  if (version > target) return { ok: false, reason: 'newer_version' };
  let data = raw;
  let v = version;
  while (v < target) {
    const step = migrations.find((m) => m.from === v);
    if (!step) return { ok: false, reason: 'unsupported_version' };
    try {
      data = step.migrate(data);
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    v += 1;
  }
  const parsed = wizardStateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  return { ok: true, wizard: normalizeState(parsed.data), migratedFrom: version < target ? version : null };
}

export type Derived = {
  name: string;
  description: string;
  category: string | null;
  templateId: string | null;
  language: string;
  status: StoredStatus;
  site: unknown | null;
  siteVersion: number | null;
};

export const DEFAULT_PROJECT_NAME = 'Untitled website';

/** Everything stored besides the wizard is derived from it with the Phase 3 generator, so the two never disagree. */
export function derive(wizard: WizardState): Derived {
  const generated = generateProject(wizard);
  const complete = wizard.step === 'review' && firstInvalidStep(wizard) === null && generated.valid;
  return {
    name: wizard.info.name.trim().slice(0, 120) || DEFAULT_PROJECT_NAME,
    description: wizard.info.description.trim().slice(0, 600),
    category: wizard.category,
    templateId: wizard.templateId,
    language: wizard.info.language,
    status: complete ? 'configured' : 'draft',
    site: generated.valid ? generated.config : null,
    siteVersion: generated.valid ? SITE_VERSION : null,
  };
}

export const categoryName = (id: string | null): string => (id ? (CATEGORY_NAMES[id] as string | undefined) ?? id : 'Not chosen yet');
