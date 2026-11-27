-- Saitlify migration 0005_modules. Paste into the Supabase SQL Editor and run ONCE.
-- Adds module tables only (project_modules, module_items, carts, orders, bookings, registrations, submissions,
-- site members, memberships, enrollments, lesson progress, app_secrets). It does not alter or delete existing data.
-- Independent of 0004_billing (Phase 7): the two can be applied in either order.
-- Safe to re-run: it stops if already applied.
begin;
create table if not exists schema_migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now());
do $$ begin
  if exists (select 1 from schema_migrations where id = '0005_modules') then
    raise exception 'Migration 0005_modules is already applied';
  end if;
end $$;

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

insert into schema_migrations (id, checksum) values ('0005_modules', '2b052ce4a64001a89dcab5a256c1b196c70647c9314fa7c25bbbe2197adc2f3f');
commit;
