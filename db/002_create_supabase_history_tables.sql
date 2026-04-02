-- Supabase schema for login, instruments, and personal certified report history
-- Run this in the Supabase SQL editor for the same project used by VITE_SUPABASE_URL.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.instruments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  scale_label text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists instruments_user_id_name_key
  on public.instruments (user_id, name);

create index if not exists instruments_user_id_updated_at_idx
  on public.instruments (user_id, updated_at desc);

create table if not exists public.certified_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  verification_id text not null unique,
  report_created_at timestamptz not null,
  detected_scale text,
  health_score integer,
  note_count integer,
  report_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists certified_reports_user_id_report_created_at_idx
  on public.certified_reports (user_id, report_created_at desc);

create index if not exists certified_reports_instrument_id_idx
  on public.certified_reports (instrument_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists instruments_set_updated_at on public.instruments;
create trigger instruments_set_updated_at
before update on public.instruments
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.instruments enable row level security;
alter table public.certified_reports enable row level security;

create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can upsert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can read own instruments"
  on public.instruments
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own instruments"
  on public.instruments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own instruments"
  on public.instruments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own instruments"
  on public.instruments
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read own certified reports"
  on public.certified_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own certified reports"
  on public.certified_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own certified reports"
  on public.certified_reports
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own certified reports"
  on public.certified_reports
  for delete
  to authenticated
  using (auth.uid() = user_id);
