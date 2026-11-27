-- Saitlify migration 0003_publishing. Paste into the Supabase SQL Editor and run ONCE.
-- Adds publishing tables only (sites, deployments). It does not alter or delete existing data.
-- Safe to re-run: it stops if already applied.
begin;
create table if not exists schema_migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now());
do $$ begin
  if exists (select 1 from schema_migrations where id = '0003_publishing') then
    raise exception 'Migration 0003_publishing is already applied';
  end if;
end $$;

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

insert into schema_migrations (id, checksum) values ('0003_publishing', '8c2d791a0d14ee4cba8c9523d86e96c537dea85d457ae74ca4bfbf27c39cbb9d');
commit;
