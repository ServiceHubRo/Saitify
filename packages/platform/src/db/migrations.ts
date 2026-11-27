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
    // Numbered 0005 so it sorts after Phase 7's 0004_billing; the two are independent and apply in either order.
    id: '0005_modules',
    sql: `
create table app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create table project_modules (
  project_id uuid not null references projects(id) on delete cascade,
  module_id text not null check (module_id ~ '^[a-z][a-z0-9-]{1,31}$'),
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  settings_version integer not null default 1,
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, module_id)
);

create table module_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  module_id text not null,
  kind text not null check (kind ~ '^[a-z][a-z_]{1,31}$'),
  parent_id uuid references module_items(id) on delete cascade,
  slug text check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  status text not null,
  position integer not null default 0,
  featured boolean not null default false,
  at timestamptz,
  ends_at timestamptz,
  price_cents integer check (price_cents is null or price_cents >= 0),
  stock integer,
  capacity integer check (capacity is null or capacity >= 0),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index module_items_slug_key on module_items (project_id, kind, slug) where slug is not null;
create index module_items_list_idx on module_items (project_id, kind, status, at desc);
create index module_items_parent_idx on module_items (parent_id) where parent_id is not null;

create table site_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  email text not null check (email = lower(email)),
  name text not null check (char_length(name) between 1 and 100),
  password_hash text not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index site_members_email_key on site_members (project_id, email);

create table site_member_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references site_members(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index site_member_sessions_member_idx on site_member_sessions (member_id);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  member_id uuid not null references site_members(id) on delete cascade,
  plan_id uuid not null references module_items(id),
  status text not null check (status in ('pending', 'active', 'cancelled', 'expired')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index memberships_one_live_idx on memberships (member_id, plan_id) where status in ('pending', 'active');
create index memberships_project_idx on memberships (project_id, status, created_at desc);

create table store_carts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  token_hash text not null unique,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index store_carts_expires_idx on store_carts (expires_at);

create table store_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number integer not null,
  access_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'shipped', 'completed', 'canceled')),
  payment_status text not null default 'awaiting' check (payment_status in ('awaiting', 'paid', 'refunded')),
  payment_method text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  customer jsonb not null,
  delivery jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
create index store_orders_project_idx on store_orders (project_id, created_at desc);

create table store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references store_orders(id) on delete cascade,
  product_id uuid references module_items(id) on delete set null,
  variant_id text,
  title text not null,
  variant_title text,
  sku text,
  unit_cents integer not null check (unit_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_cents integer not null check (line_cents >= 0)
);
create index store_order_items_order_idx on store_order_items (order_id);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid references module_items(id) on delete set null,
  staff_id uuid references module_items(id) on delete set null,
  service_title text not null,
  staff_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  reference text not null,
  access_hash text not null,
  customer jsonb not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (project_id, reference)
);
create index bookings_project_time_idx on bookings (project_id, starts_at);
create index bookings_staff_time_idx on bookings (project_id, staff_id, starts_at);

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  event_id uuid not null references module_items(id),
  name text not null,
  email text not null check (email = lower(email)),
  quantity integer not null default 1 check (quantity between 1 and 20),
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  reference text not null,
  access_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, reference)
);
create unique index event_registrations_one_per_email_idx on event_registrations (event_id, email) where status = 'registered';
create index event_registrations_event_idx on event_registrations (event_id, created_at desc);

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  form_id uuid not null references module_items(id),
  data jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index form_submissions_form_idx on form_submissions (project_id, form_id, created_at desc);

create table course_enrollments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  course_id uuid not null references module_items(id),
  member_id uuid not null references site_members(id) on delete cascade,
  status text not null check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, member_id)
);
create index course_enrollments_project_idx on course_enrollments (project_id, status, created_at desc);

create table lesson_progress (
  enrollment_id uuid not null references course_enrollments(id) on delete cascade,
  lesson_id uuid not null references module_items(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (enrollment_id, lesson_id)
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
