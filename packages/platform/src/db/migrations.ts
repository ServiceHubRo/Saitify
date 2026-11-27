import { createHash } from 'node:crypto';
import type { Db } from './types';

export type Migration = { id: string; sql: string };

/**
 * Ordered, append-only migrations. Never edit an applied migration: add a new one.
 * All statements are additive (new tables, indexes). Nothing here drops or rewrites existing data.
 */
export const MIGRATIONS: Migration[] = [
  {
    id: '0001_accounts',
    sql: `
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null check (char_length(name) between 1 and 100),
  password_hash text not null,
  email_verified_at timestamptz,
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email))
);
create unique index users_email_key on users (email);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  persistent boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password', 'change_email')),
  token_hash text not null unique,
  new_email text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_user_purpose_idx on auth_tokens (user_id, purpose);

create table rate_limits (
  key text primary key,
  count integer not null,
  window_start timestamptz not null
);
create index rate_limits_window_idx on rate_limits (window_start);
`,
  },
  {
    id: '0002_projects',
    sql: `
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  name_custom boolean not null default false,
  description text not null default '' check (char_length(description) <= 600),
  category text,
  template_id text,
  language text not null default 'en',
  status text not null default 'draft' check (status in ('draft', 'configured')),
  wizard jsonb not null,
  wizard_version integer not null,
  site jsonb,
  site_version integer,
  meta jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  client_key text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_updated_idx on projects (owner_id, updated_at desc);
create index projects_owner_created_idx on projects (owner_id, created_at desc);
create index projects_owner_name_idx on projects (owner_id, lower(name));
create unique index projects_owner_client_key_idx on projects (owner_id, client_key) where client_key is not null;
`,
  },
  {
    id: '0003_publishing',
    sql: `
create table sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  subdomain text not null check (subdomain ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' and subdomain !~ '--'),
  state text not null default 'unpublished' check (state in ('published', 'unpublished')),
  active_deployment_id uuid,
  next_version integer not null default 1,
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sites_subdomain_key on sites (subdomain);
create index sites_owner_idx on sites (owner_id);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  project_id uuid not null,
  owner_id uuid not null,
  version integer not null,
  kind text not null default 'publish' check (kind in ('publish', 'rollback')),
  status text not null check (status in ('validating', 'preparing', 'deploying', 'verifying', 'succeeded', 'failed')),
  subdomain text not null,
  source_revision integer,
  source_hash text,
  snapshot jsonb,
  snapshot_hash text,
  rollback_of uuid references deployments(id) on delete set null,
  warnings jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  reachability text not null default 'unchecked' check (reachability in ('unchecked', 'verified', 'unreachable')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (site_id, version)
);
create index deployments_site_version_idx on deployments (site_id, version desc);
-- At most one publication in flight per website. Concurrent attempts fail on this index instead of racing.
create unique index deployments_one_in_flight_idx on deployments (site_id) where status in ('validating', 'preparing', 'deploying', 'verifying');

alter table sites add constraint sites_active_deployment_fk foreign key (active_deployment_id) references deployments(id) on delete set null;
`,
  },
  {
    id: '0004_billing',
    sql: `
-- Plans are data, not code: prices, limits and Stripe ids are edited by an administrator. Amounts are never invented:
-- they stay null until synchronized from the Stripe price itself.
create table plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  active boolean not null default true,
  public boolean not null default true,
  recommended boolean not null default false,
  priority integer not null default 0,
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  monthly_amount integer check (monthly_amount is null or monthly_amount >= 0),
  yearly_amount integer check (yearly_amount is null or yearly_amount >= 0),
  stripe_product_id text,
  stripe_price_monthly text,
  stripe_price_yearly text,
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  support_level text not null default 'community',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plans_price_monthly_key on plans (stripe_price_monthly) where stripe_price_monthly is not null;
create unique index plans_price_yearly_key on plans (stripe_price_yearly) where stripe_price_yearly is not null;

-- The Free plan is a real plan with real limits. Limits are configuration: change them in the plans table.
insert into plans (id, name, description, priority, features, limits, support_level)
values ('free', 'Free', 'Everything you need to build and publish your first website. No card required.', 0,
  '["Visual editor","Publish on a Saitlify address","Unlimited edits"]'::jsonb,
  '{"projects":5,"published_sites":1,"custom_domains":0}'::jsonb, 'community');

create table stripe_customers (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  plan_id text not null references plans(id),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),
  billing_interval text check (billing_interval in ('month', 'year')),
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  past_due_since timestamptz,
  trial_end timestamptz,
  last_event_created bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_plan_idx on subscriptions (plan_id);

-- Every Stripe event is recorded once. The primary key makes duplicate deliveries and concurrent retries harmless.
create table billing_events (
  stripe_event_id text primary key,
  type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table invoices (
  stripe_invoice_id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  number text,
  status text not null,
  currency text not null,
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  hosted_invoice_url text,
  invoice_pdf text,
  stripe_created timestamptz not null,
  last_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index invoices_user_idx on invoices (user_id, stripe_created desc);

create table subscription_history (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  event text not null,
  plan_id text,
  status text,
  detail text,
  stripe_event_id text,
  created_at timestamptz not null default now()
);
create index subscription_history_user_idx on subscription_history (user_id, id desc);

create table plan_audit (
  id bigserial primary key,
  plan_id text not null,
  admin_user_id uuid references users(id) on delete set null,
  change jsonb not null,
  created_at timestamptz not null default now()
);
`,
  },
];

export const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');

const LOCK_ID = 7243001;

async function ensureTable(db: Db) {
  await db.exec(`create table if not exists schema_migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now())`);
}

export async function appliedMigrations(db: Db): Promise<Map<string, string>> {
  await ensureTable(db);
  const rows = await db.query<{ id: string; checksum: string }>('select id, checksum from schema_migrations');
  return new Map(rows.map((r) => [r.id, r.checksum]));
}

export async function pendingMigrations(db: Db, list: Migration[] = MIGRATIONS): Promise<Migration[]> {
  const applied = await appliedMigrations(db);
  return list.filter((m) => !applied.has(m.id));
}

/** Applies pending migrations in order, each in its own transaction. Refuses to continue if an applied migration was edited. */
export async function runMigrations(db: Db, list: Migration[] = MIGRATIONS): Promise<string[]> {
  const applied = await appliedMigrations(db);
  for (const m of list) {
    const sum = applied.get(m.id);
    if (sum !== undefined && sum !== checksum(m.sql)) {
      throw new Error(`Migration ${m.id} was changed after it was applied. Add a new migration instead.`);
    }
  }
  const ran: string[] = [];
  for (const m of list) {
    if (applied.has(m.id)) continue;
    await db.tx(async (t) => {
      await t.query('select pg_advisory_xact_lock($1)', [LOCK_ID]);
      const again = await t.query('select 1 from schema_migrations where id = $1', [m.id]);
      if (again.length > 0) return; // another process applied it first
      await t.exec(m.sql);
      await t.query('insert into schema_migrations (id, checksum) values ($1, $2)', [m.id, checksum(m.sql)]);
      ran.push(m.id);
    });
  }
  return ran;
}
