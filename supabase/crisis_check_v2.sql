-- Crisis check v2: same rules as the app (src/lib/crisis.ts).
--
-- v1 only removed spaces, so "don't want to be here" (apostrophe),
-- "self-harm" (hyphen) and "wanted to die" slipped past. v2 lowercases,
-- drops spaces and punctuation (straight and curly apostrophes, hyphens,
-- dots, underscores), then looks for the same phrases. "kms" only counts
-- as a word on its own, so "bookmarks" isn't flagged.
--
-- Safe to run more than once; replaces the function in place.

create or replace function public.sounds_like_crisis(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    lower(coalesce(p_text, '')) ~ '(^|[^a-z])kms([^a-z]|$)'
    or regexp_replace(lower(coalesce(p_text, '')), '[[:space:]''‘’`._-]+', '', 'g') ~
      '(killmyself|wanttodie|wantedtodie|wannadie|endmylife|enditall|suicid|selfharm|cutmyself|cuttingmyself|hurtmyself|noreasontolive|betteroffwithoutme|dontwanttobehere|disappearforever|죽고싶|자살|자해|살기싫|사라지고싶|없어지고싶|끝내고싶|손목|뛰어내리)';
$$;

-- Quick check (all true except the last):
--   select public.sounds_like_crisis('I don’t want to be here'),
--          public.sounds_like_crisis('thinking about self-harm'),
--          public.sounds_like_crisis('I wanted to die'),
--          public.sounds_like_crisis('죽고 싶어'),
--          public.sounds_like_crisis('my bookmarks are a mess');
