-- 요뜨(yoddeu) candidate aggregation and promotion helpers.
-- Run this after supabase/schema.sql in Supabase SQL Editor.

create or replace view public.trend_candidate_summary
with (security_invoker = true)
as
select
  normalized_keyword,
  (array_agg(keyword order by mention_count desc, collected_at desc))[1] as keyword,
  sum(mention_count)::integer as mention_count,
  sum(engagement_count)::integer as engagement_count,
  count(*)::integer as candidate_count,
  count(distinct source_name)::integer as source_count,
  count(distinct source_url)::integer as article_count,
  max(collected_at) as latest_collected_at,
  min(collected_at) as first_collected_at,
  (
    sum(mention_count) * 1.0
    + count(distinct source_name) * 2.0
    + count(distinct source_url) * 0.5
    + greatest(0, 24 - extract(epoch from (now() - max(collected_at))) / 3600) * 0.25
  )::numeric(10, 4) as score,
  array_remove((array_agg(distinct title))[1:5], null) as sample_titles,
  array_remove((array_agg(distinct source_url))[1:5], null) as sample_urls
from public.trend_candidates
group by normalized_keyword;

create or replace function public.promote_candidate_to_trend(
  p_normalized_keyword text,
  p_rank integer default null,
  p_status text default '상승 중',
  p_category text default '뉴스',
  p_summary text default null,
  p_publish boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.trend_candidate_summary%rowtype;
  promoted_trend_id uuid;
  next_rank integer;
begin
  select *
  into candidate
  from public.trend_candidate_summary
  where normalized_keyword = p_normalized_keyword;

  if not found then
    raise exception 'No trend candidate found for normalized_keyword=%', p_normalized_keyword;
  end if;

  select coalesce(max(rank), 0) + 1
  into next_rank
  from public.trends;

  insert into public.trends (
    rank,
    keyword,
    status,
    category,
    tags,
    summary,
    score,
    published
  ) values (
    coalesce(p_rank, next_rank),
    candidate.keyword,
    p_status,
    p_category,
    array[p_category, '뉴스'],
    coalesce(p_summary, candidate.keyword || ' 관련 뉴스 언급이 증가하고 있어요.'),
    candidate.score,
    p_publish
  )
  on conflict (keyword) do update
  set
    rank = excluded.rank,
    status = excluded.status,
    category = excluded.category,
    tags = excluded.tags,
    summary = excluded.summary,
    score = excluded.score,
    published = excluded.published
  returning id into promoted_trend_id;

  delete from public.trend_sources
  where trend_id = promoted_trend_id;

  insert into public.trend_sources (
    trend_id,
    source_type,
    source_name,
    source_url,
    title,
    count,
    published_at
  )
  select
    promoted_trend_id,
    source_type,
    source_name,
    source_url,
    max(title) as title,
    sum(mention_count)::integer as count,
    max(collected_at) as published_at
  from public.trend_candidates
  where normalized_keyword = p_normalized_keyword
  group by source_type, source_name, source_url;

  return promoted_trend_id;
end;
$$;

comment on view public.trend_candidate_summary is 'Aggregates collected candidate keywords for manual review and promotion.';
comment on function public.promote_candidate_to_trend(text, integer, text, text, text, boolean) is 'Promotes one normalized candidate keyword into trends and trend_sources. Defaults to published=false for review.';

revoke all on function public.promote_candidate_to_trend(text, integer, text, text, text, boolean) from public;
revoke all on function public.promote_candidate_to_trend(text, integer, text, text, text, boolean) from anon;
revoke all on function public.promote_candidate_to_trend(text, integer, text, text, text, boolean) from authenticated;
grant execute on function public.promote_candidate_to_trend(text, integer, text, text, text, boolean) to service_role;
