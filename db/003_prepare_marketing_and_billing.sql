-- Prepare Supabase profiles for marketing consent, report credits, and plan status.
-- Run this after db/002_create_supabase_history_tables.sql.

alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_source text,
  add column if not exists report_credits integer not null default 0,
  add column if not exists plan_slug text,
  add column if not exists plan_status text,
  add column if not exists plan_renews_at timestamptz,
  add column if not exists billing_customer_id text,
  add column if not exists wix_contact_id text,
  add column if not exists wix_contact_synced_at timestamptz;

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  event_key text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists billing_events_event_key_key
  on public.billing_events (event_key)
  where event_key is not null;

create index if not exists billing_events_user_id_created_at_idx
  on public.billing_events (user_id, created_at desc);

alter table public.billing_events enable row level security;

create policy "Users can read own billing events"
  on public.billing_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own billing events"
  on public.billing_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own billing events"
  on public.billing_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
