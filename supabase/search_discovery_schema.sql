-- Search & Discovery (Step 8). Two additive schema changes (extend the existing
-- profiles.search_text trigger, add the same pattern to posts) and two new
-- read-only SECURITY INVOKER functions for the two things PostgREST's
-- declarative filter API can't express: full-text RANKING (ts_rank), and a
-- GROUP BY aggregate (distinct school names + counts). No RLS policy is
-- touched anywhere in this file — every table already involved (profiles,
-- posts) is already fully public-read, so these functions run with the
-- caller's own (already-sufficient) privileges rather than an owner's.

-- =====================================================================
-- 1. Extend profiles.search_text to include username (it was missing —
-- people search couldn't find someone by their username at all before this).
-- Same trigger, same security (SECURITY INVOKER, the original default — this
-- one only derives a column on the row already being written under the
-- caller's own RLS, so no elevated privilege was ever needed here).
-- =====================================================================
create or replace function public.profiles_search_text_update()
returns trigger
language plpgsql
as $$
begin
  new.search_text := to_tsvector('english',
    coalesce(new.username, '') || ' ' ||
    coalesce(new.full_name, '') || ' ' ||
    coalesce(new.school_name, '') || ' ' ||
    array_to_string(coalesce(new.interests, '{}'), ' ')
  );
  return new;
end;
$$;

-- Backfill existing rows so username becomes searchable immediately, not
-- just for future profile edits.
update public.profiles set search_text = to_tsvector('english',
  coalesce(username, '') || ' ' ||
  coalesce(full_name, '') || ' ' ||
  coalesce(school_name, '') || ' ' ||
  array_to_string(coalesce(interests, '{}'), ' ')
);

-- =====================================================================
-- 2. posts.search_text — same exact pattern as profiles' (trigger-maintained
-- tsvector + GIN index), applied to post content. There was previously no
-- text-search capability on posts at all.
-- =====================================================================
alter table public.posts add column search_text tsvector;

create index posts_search_idx on public.posts using gin (search_text);

create or replace function public.posts_search_text_update()
returns trigger
language plpgsql
as $$
begin
  new.search_text := to_tsvector('english', coalesce(new.content, ''));
  return new;
end;
$$;

create trigger posts_search_text_trigger
  before insert or update on public.posts
  for each row execute function public.posts_search_text_update();

-- Backfill existing posts. This also keeps working for edits made through
-- edit_post() (posts_edit_delete.sql) — SECURITY DEFINER only affects
-- permission checks, not whether triggers fire, so an edited post's
-- search_text stays in sync automatically.
update public.posts set search_text = to_tsvector('english', coalesce(content, ''));

-- =====================================================================
-- 3. search_posts() — ranks by ts_rank (text relevance) then recency, with
-- an optional exact-category filter (matching how fetchPostsBySchool already
-- treats category — a hard filter, not a fuzzy signal). Returns only
-- (id, rank): the client re-hydrates full Post objects via the EXISTING
-- POST_SELECT (fetchPostsByIds), so this never duplicates the post-rendering
-- shape or bypasses anything posts.ts already does.
-- SECURITY INVOKER, not DEFINER: posts are already fully public-read, so
-- there is nothing here that needs bypassing RLS for.
-- =====================================================================
create or replace function public.search_posts(p_query text, p_category text default null, p_limit integer default 20)
returns table(id uuid, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, ts_rank(p.search_text, p_query::tsquery) as rank
  from public.posts p
  where p.search_text @@ p_query::tsquery
    and (p_category is null or p.category = p_category)
  order by rank desc, p.created_at desc
  limit p_limit;
$$;

-- =====================================================================
-- 4. search_schools_by_name() — the one thing school_name being free-text
-- (not a real table) makes awkward: "distinct school names + how many
-- students" needs a GROUP BY, which PostgREST's filter API can't express.
-- Prefix match (not substring) — predictable, and lets this use the existing
-- profiles_school_name_idx (schools_performance_index.sql, Step 4) instead
-- of a full scan. Returns only school_name + a count — no per-student data.
-- =====================================================================
create or replace function public.search_schools_by_name(p_term text, p_limit integer default 10)
returns table(school_name text, student_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.school_name, count(*) as student_count
  from public.profiles p
  where p.school_name ilike p_term || '%'
  group by p.school_name
  order by student_count desc
  limit p_limit;
$$;
