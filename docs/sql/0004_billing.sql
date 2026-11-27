-- Saitlify migration 0004_billing. Paste into the Supabase SQL Editor and run ONCE.
-- Adds billing tables only (plans, subscriptions, invoices, events). Seeds the Free plan. It does not alter or delete existing data.
-- Safe to re-run: it stops if already applied.
begin;
create table if not exists schema_migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now());
do $$ begin
  if exists (select 1 from schema_migrations where id = '0004_billing') then
    raise exception 'Migration 0004_billing is already applied';
  end if;
end $$;

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

insert into schema_migrations (id, checksum) values ('0004_billing', 'c13ffaff88d9bf8f98e4b16c9cbe5be5f9182f85042c87b798fd2c43a1933547');
commit;
