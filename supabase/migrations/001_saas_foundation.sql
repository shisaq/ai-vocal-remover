create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro_monthly', 'pro_yearly')),
  plan_renews_at timestamptz,
  stripe_customer_id text,
  wechat_openid text,
  monthly_jobs_used int not null default 0,
  monthly_reset_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  source_type text not null check (source_type in ('upload', 'url')),
  source_url text,
  source_pathname text,
  source_filename text,
  duration_seconds int,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  model text not null default 'htdemucs',
  stems jsonb,
  error text,
  cost_credits int not null default 1,
  modal_job_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists jobs_user_created_idx on public.jobs(user_id, created_at desc);
create index if not exists jobs_modal_job_idx on public.jobs(modal_job_id);

create table if not exists public.one_time_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  credits_remaining int not null,
  paid_amount_cents int not null,
  stripe_payment_intent text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.one_time_purchases enable row level security;
alter table public.events enable row level security;

create policy "profiles are visible to owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles can be updated by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "jobs are visible to owner"
  on public.jobs for select
  using (auth.uid() = user_id);

create policy "jobs can be deleted by owner"
  on public.jobs for delete
  using (auth.uid() = user_id);

create policy "purchases are visible to owner"
  on public.one_time_purchases for select
  using (auth.uid() = user_id);

create policy "events can be inserted by owner"
  on public.events for insert
  with check (auth.uid() = user_id or user_id is null);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
