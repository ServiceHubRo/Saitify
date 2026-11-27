-- Saitlify migration 0002_projects. Paste into the Supabase SQL Editor and run ONCE.
-- Creates the projects table. Needs 0001_accounts. Run this SECOND on a new, empty database. It does not alter or delete existing data.
-- Safe to re-run: it stops if already applied.
begin;
create table if not exists schema_migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now());
do $$ begin
  if exists (select 1 from schema_migrations where id = '0002_projects') then
    raise exception 'Migration 0002_projects is already applied';
  end if;
end $$;

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

insert into schema_migrations (id, checksum) values ('0002_projects', 'b011d4f94256846272bbf540d9b43cddae0fa090dbb8c7930a7171a662edb767');
commit;
