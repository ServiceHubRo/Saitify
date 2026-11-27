-- Saitlify migration 0001_accounts. Paste into the Supabase SQL Editor and run ONCE.
-- Creates the account tables (users, sessions, auth tokens, rate limits). Run this FIRST on a new, empty database. It does not alter or delete existing data.
-- Safe to re-run: it stops if already applied.
begin;
create table if not exists schema_migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now());
do $$ begin
  if exists (select 1 from schema_migrations where id = '0001_accounts') then
    raise exception 'Migration 0001_accounts is already applied';
  end if;
end $$;

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

insert into schema_migrations (id, checksum) values ('0001_accounts', 'f418ae83b6baf263280d75709e1b21b8c8b57bf6d3109ed35a98159017e6d710');
commit;
