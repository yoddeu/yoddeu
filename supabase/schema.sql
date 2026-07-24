-- 요뜨(yoddeu) Supabase initial schema
-- Run this file in Supabase SQL Editor for the target project.

create extension if not exists pgcrypto;

create table if not exists public.trends (
  id uuid primary key default gen_random_uuid(),
  rank integer not null check (rank > 0),
  keyword text not null,
  status text not null,
  category text not null,
  tags text[] not null default '{}',
  summary text not null,
  score numeric(10, 4) not null default 0,
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (keyword)
);

create table if not exists public.trend_sources (
  id uuid primary key default gen_random_uuid(),
  trend_id uuid not null references public.trends(id) on delete cascade,
  source_type text not null,
  source_name text not null,
  source_url text,
  title text,
  count integer not null default 0 check (count >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.trend_candidates (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  normalized_keyword text not null,
  category_guess text,
  source_type text not null,
  source_name text not null,
  source_url text,
  title text,
  summary_raw text,
  mention_count integer not null default 1 check (mention_count >= 0),
  engagement_count integer not null default 0 check (engagement_count >= 0),
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (normalized_keyword, source_type, source_url)
);

create table if not exists public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  collector_name text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  candidates_found integer not null default 0 check (candidates_found >= 0),
  candidates_saved integer not null default 0 check (candidates_saved >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists trends_published_rank_idx on public.trends (published, rank);
create index if not exists trends_category_idx on public.trends (category);
create index if not exists trends_updated_at_idx on public.trends (updated_at desc);
create index if not exists trend_sources_trend_id_idx on public.trend_sources (trend_id);
create index if not exists trend_candidates_collected_at_idx on public.trend_candidates (collected_at desc);
create index if not exists trend_candidates_normalized_keyword_idx on public.trend_candidates (normalized_keyword);
create index if not exists collection_runs_started_at_idx on public.collection_runs (started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trends_updated_at on public.trends;
create trigger set_trends_updated_at
before update on public.trends
for each row
execute function public.set_updated_at();

alter table public.trends enable row level security;
alter table public.trend_sources enable row level security;
alter table public.trend_candidates enable row level security;
alter table public.collection_runs enable row level security;

drop policy if exists "Public can read published trends" on public.trends;
create policy "Public can read published trends"
on public.trends
for select
to anon, authenticated
using (published = true);

drop policy if exists "Public can read sources for published trends" on public.trend_sources;
create policy "Public can read sources for published trends"
on public.trend_sources
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.trends
    where trends.id = trend_sources.trend_id
      and trends.published = true
  )
);

-- No anon/authenticated policies are defined for trend_candidates or collection_runs.
-- They are intended for server-side collectors using the Supabase service role key.
