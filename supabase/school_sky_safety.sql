-- School Sky safety: keep anonymous wishes (and a star's line / sky
-- description, which classmates see) free of insults, slurs and self-harm
-- taunts, and let students report a wish.
-- Run AFTER school_sky_describe.sql. Safe to run more than once.
--
-- The app checks the same list first (src/lib/contentFilter.ts) so people
-- get a friendly message; this is the part a modified app can't skip.
--
-- Reports don't auto-hide anything by count (that can be abused to silence
-- someone). A report hides the wish for the person who reported it and is
-- kept in sky_wish_reports for review.

-- =====================================================================
-- 1. The word list and the check
-- =====================================================================
create table if not exists public.blocked_words (
  word text primary key
);
alter table public.blocked_words enable row level security;
-- No policies: only the functions below read it.

insert into public.blocked_words (word) values
  ('fuck'), ('fuk'), ('shit'), ('bitch'), ('bastard'), ('asshole'), ('dickhead'), ('pussy'), ('cunt'),
  ('slut'), ('whore'), ('faggot'), ('retard'), ('nigger'), ('nigga'), ('motherfucker'), ('wanker'),
  ('killyourself'), ('godie'), ('gokillyourself'), ('nobodylikesyou'), ('everyonehatesyou'),
  ('시발'), ('씨발'), ('씨바'), ('시바'), ('ㅅㅂ'), ('ㅆㅂ'), ('쓰발'),
  ('병신'), ('븅신'), ('ㅂㅅ'), ('좆'), ('존나'), ('ㅈㄴ'), ('개새끼'), ('개새'), ('새끼야'), ('씹'),
  ('지랄'), ('ㅈㄹ'), ('미친놈'), ('미친년'), ('꺼져'), ('닥쳐'), ('엿먹어'), ('느금마'), ('니애미'), ('애미'),
  ('느그엄마'), ('섹스'), ('야동'), ('자살해'), ('죽어라'), ('죽여버'), ('뒤져'), ('뒈져'), ('찐따'), ('걸레'),
  ('창녀'), ('틀딱'), ('애자')
on conflict (word) do nothing;

-- Same normalising as the app: lowercase, undo (or drop) look-alike
-- symbols, keep only Latin/Hangul letters, squash repeated letters.
create or replace function public.normalize_for_filter(p_text text, p_leet boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      case when p_leet
        then translate(lower(coalesce(p_text, '')), '0134578@$', 'oieastas')
        else translate(lower(coalesce(p_text, '')), '0134578@$', '')
      end,
      '[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g'),
    '(.)\1+', '\1', 'g');
$$;

create or replace function public.has_blocked_words(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(p_text, '') ~* '(^|[^a-z''])(k\s*y\s*s|k\s*m\s*s|stfu)([^a-z'']|$)'
    or exists (
      select 1 from public.blocked_words b
      where public.normalize_for_filter(p_text, true) like '%' || public.normalize_for_filter(b.word, true) || '%'
         or public.normalize_for_filter(p_text, false) like '%' || public.normalize_for_filter(b.word, true) || '%'
    );
$$;

-- =====================================================================
-- 2. Guards on what classmates see
-- =====================================================================
create or replace function public.sky_wish_kind_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_blocked_words(new.text) then
    raise exception 'Let''s keep it kind 💛 Try saying it a different way.';
  end if;
  return new;
end;
$$;
drop trigger if exists sky_wish_kind_guard on public.sky_wishes;
create trigger sky_wish_kind_guard
  before insert or update on public.sky_wishes
  for each row execute function public.sky_wish_kind_guard();

create or replace function public.sky_star_kind_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_blocked_words(new.note) or public.has_blocked_words(new.sky_desc) then
    raise exception 'Let''s keep it kind 💛 Try saying it a different way.';
  end if;
  return new;
end;
$$;
drop trigger if exists sky_star_kind_guard on public.sky_stars;
create trigger sky_star_kind_guard
  before insert or update on public.sky_stars
  for each row execute function public.sky_star_kind_guard();

-- =====================================================================
-- 3. Reporting a wish
-- =====================================================================
create table if not exists public.sky_wish_reports (
  wish_id uuid not null references public.sky_wishes (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (wish_id, reporter_id),
  constraint sky_wish_reports_reason_length check (reason is null or char_length(reason) <= 200)
);
alter table public.sky_wish_reports enable row level security;
drop policy if exists "Reporters can see their own wish reports" on public.sky_wish_reports;
create policy "Reporters can see their own wish reports"
  on public.sky_wish_reports for select
  to authenticated
  using (reporter_id = auth.uid());

create or replace function public.report_wish(p_wish uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select author_id into v_author from public.sky_wishes where id = p_wish;
  if v_author is null then
    return; -- already gone
  end if;
  if not public.same_school(auth.uid(), v_author) then
    raise exception 'Unable to report this wish';
  end if;
  -- Flood guard.
  if (select count(*) from public.sky_wish_reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of reports — try again later';
  end if;
  insert into public.sky_wish_reports (wish_id, reporter_id, reason)
  values (p_wish, auth.uid(), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict do nothing;
end;
$$;
revoke all on function public.report_wish(uuid, text) from public;
grant execute on function public.report_wish(uuid, text) to authenticated;

-- Today's wishes, now leaving out the ones you've reported.
create or replace function public.fetch_sky_wishes()
returns table (id uuid, text text, created_at timestamptz, cheers int, mine boolean, cheered boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.text, w.created_at,
         (select count(*)::int from public.sky_wish_cheers c where c.wish_id = w.id) as cheers,
         w.author_id = auth.uid() as mine,
         exists (select 1 from public.sky_wish_cheers c where c.wish_id = w.id and c.user_id = auth.uid()) as cheered
  from public.sky_wishes w
  join public.profiles me on me.id = auth.uid()
  where w.created_at > now() - interval '24 hours'
    and (
      (me.school_id is not null and me.school_id = w.school_id)
      or (me.school_id is null and me.school_name is not null and me.school_name = w.school_name)
    )
    and not exists (select 1 from public.sky_wish_reports r where r.wish_id = w.id and r.reporter_id = auth.uid())
  order by w.created_at desc
  limit 40;
$$;
revoke all on function public.fetch_sky_wishes() from public;
grant execute on function public.fetch_sky_wishes() to authenticated;
