-- iHelp: richer helper reputation (product upgrade 2026-08-13).
--
-- Two additions, both preserving the sealed-anonymity contract (a third party
-- never learns WHO rated a helper or on WHICH specific request):
--   1. helper_ratings view gains the request `category` — useful context for a
--      review ("electrical work · 5★") that is NOT rater-identifying (many
--      requests share a category; it carries no linkage to a person).
--   2. get_helper_stats RPC: aggregate reputation numbers (completed-jobs count,
--      per-category counts, star distribution) computed server-side so no raw
--      per-request row is exposed.

-- 1. Rebuild the anonymized public rating surface WITH category context.
-- request_id / rater_id stay out (they are the linkage we must not expose).
drop view public.helper_ratings;
create view public.helper_ratings
  with (security_invoker = false) as
  select r.helper_id, r.stars, r.note, r.created_at, hr.category
  from public.ratings r
  join public.help_requests hr on hr.id = r.request_id;
revoke all on public.helper_ratings from anon, public;
grant select on public.helper_ratings to authenticated;

-- 2. Aggregate reputation for a helper. SECURITY DEFINER so it can count over
-- rows the caller cannot read individually, returning ONLY aggregates (counts
-- and a star histogram) — never a raw row, so no linkage leaks.
create or replace function public.get_helper_stats(p_helper_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    -- completed jobs = requests this helper was the selected offer on and that
    -- reached completed or rated
    'completed_jobs', (
      select count(*)
      from public.offers o
      join public.help_requests r on r.assigned_offer_id = o.id
      where o.helper_id = p_helper_id
        and o.status = 'selected'
        and r.status in ('completed', 'rated')
    ),
    'rating_count', (
      select count(*) from public.ratings where helper_id = p_helper_id
    ),
    'rating_avg', (
      select round(avg(stars)::numeric, 2) from public.ratings where helper_id = p_helper_id
    ),
    -- star histogram: { "5": n, "4": n, ... } (only non-zero levels present)
    'distribution', coalesce((
      select jsonb_object_agg(stars::text, c)
      from (
        select stars, count(*) c
        from public.ratings where helper_id = p_helper_id
        group by stars
      ) d
    ), '{}'::jsonb),
    -- top categories this helper has worked in (from completed/rated jobs)
    'categories', coalesce((
      select jsonb_object_agg(category, c)
      from (
        select r.category, count(*) c
        from public.offers o
        join public.help_requests r on r.assigned_offer_id = o.id
        where o.helper_id = p_helper_id
          and o.status = 'selected'
          and r.status in ('completed', 'rated')
        group by r.category
        order by count(*) desc
        limit 6
      ) cat
    ), '{}'::jsonb)
  );
$$;

revoke execute on function public.get_helper_stats(uuid) from public, anon;
grant execute on function public.get_helper_stats(uuid) to authenticated;
